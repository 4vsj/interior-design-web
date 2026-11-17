// 3D orbit preview. Plan x maps to world X, plan y maps to world Z, Y is up.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { floorTexture, tileTexture, wallTexture } from './textures.js';
import { buildBed3D, buildCloset3D, buildFixture3D, buildSetup3D } from './models3d.js';
import { ensuiteLayout } from './ensuite.js';
import { bedRect, deskSolids, doorSwing, snapBed, WALL_T, WALLS, wallInfo } from './geometry.js';
import { stripSegments, TEMP_COLOR } from './lighting.js';

RectAreaLightUniformsLib.init();

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.userData.ownMaterial) o.material.dispose();
  });
}

function clearGroup(g) {
  for (const c of [...g.children]) {
    disposeTree(c);
    g.remove(c);
  }
}

/** Flat polygon on the floor from plan points [{x, y}]. */
function floorPoly(points, color, opacity, y) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    pos.setXYZ(i, px, y, py);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.ownMaterial = true;
  mesh.renderOrder = 1;
  return mesh;
}

const rectPts = (r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];

export function createScene(container, store) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // filmic-but-neutral tone mapping keeps furniture colours true while taming bright lights
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // shadows only change when the scene does, not when the camera orbits
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // the sky gradient is CSS behind a transparent canvas, so it costs nothing to draw
  scene.background = null;
  // soft studio reflections for every material, baked once
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.15;
  controls.rotateSpeed = 0.7;
  controls.zoomToCursor = true;
  // free look: up to straight down and nearly straight up, and close enough to stand in the room
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI - 0.02;
  controls.minDistance = 0.15;
  controls.maxDistance = 40;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb7ad9f, 1.1);
  scene.add(hemi);
  // daylight; shadows come from the ceiling lights only, which keeps laptops fast
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.castShadow = false;
  scene.add(sun);
  scene.add(sun.target);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0xe2e4e7, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  ground.receiveShadow = true;
  scene.add(ground);

  const roomGroup = new THREE.Group();
  const bedsGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  const desksGroup = new THREE.Group();
  const lightsGroup = new THREE.Group();
  const closetsGroup = new THREE.Group();
  const ensuiteGroup = new THREE.Group();
  scene.add(roomGroup, bedsGroup, overlayGroup, desksGroup, lightsGroup, closetsGroup, ensuiteGroup);

  const wallMatBase = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallTexture(THREE), roughness: 0.92 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const trimMatBase = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const doorMatBase = new THREE.MeshStandardMaterial({ color: 0xd8cbb8, roughness: 0.7 });
  const glassMatBase = new THREE.MeshStandardMaterial({ color: 0xbfdcf2, roughness: 0.1, transparent: true, opacity: 0.35 });
  const floorTex = floorTexture(THREE, renderer);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTex, roughness: 0.55 });
  const stubMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9 });
  const tileTex = tileTexture(THREE, renderer);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tileTex, roughness: 0.35 });
  const bathWallMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, map: wallMatBase.map, roughness: 0.85 });

  // glow for lamps, LEDs and RGB at night; daytime renders straight to screen
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let bloomOn = false;
  const nightSky = new THREE.Color(0x0b0e16);

  // eased camera moves for the Overview and Eye level buttons
  let tween = null;
  function flyTo(pos, target, ms = 750) {
    tween = {
      p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms,
    };
    dirty = true;
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.start) / tween.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (k >= 1) tween = null;
    return true;
  }

  let walls = []; // { group, stub, normal: Vector3, center: Vector3 }
  const STUB_H = 0.12; // cutaway height for walls between the camera and the room
  const ENS_CUT = 1.0; // ensuite walls are cut at this height from outside, so they still read as walls
  let roomKey = '';
  let frameKey = '';
  const beds = new Map(); // id -> { key, group }
  const desks = new Map(); // id -> { key, group }
  const closets = new Map(); // id -> { key, group }
  let ensuiteKey = '';
  let ensuiteWalls = []; // [{ full, stub }] partition walls of the ensuite and walk-in closet
  let lightsKey = '';
  let cycling = []; // strips with the slow colour cycle: { base: Color, lights, mats }
  let dirty = true;

  function buildRoom(d) {
    clearGroup(roomGroup);
    walls = [];
    const { width: W, length: L, height: H } = d.room;
    const T = WALL_T;

    floorTex.repeat.set(W / floorTex.userData.tile, L / floorTex.userData.tile);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, L / 2);
    floor.receiveShadow = true;
    roomGroup.add(floor);

    for (const wall of WALLS) {
      const info = wallInfo(d.room, wall);
      const group = new THREE.Group();
      const stub = new THREE.Group();
      const wallMat = wallMatBase;
      const trimMat = trimMatBase;
      const doorMat = doorMatBase;
      const glassMat = glassMatBase;
      const horiz = wall === 'top' || wall === 'bottom';
      // top/bottom walls run past the corners to close them
      const a0 = horiz ? -T : 0;
      const a1 = horiz ? info.len + T : info.len;
      const fixed = { top: -T / 2, bottom: L + T / 2, left: -T / 2, right: W + T / 2 }[wall];

      // box in wall coords: along a..b, height y0..y1, depth offset (+ is into the room) and thickness
      const piece = (mat, a, b, y0, y1, depth = T, inset = 0, into = group) => {
        if (b - a < 1e-4 || y1 - y0 < 1e-4) return null;
        const geo = horiz
          ? new THREE.BoxGeometry(b - a, y1 - y0, depth)
          : new THREE.BoxGeometry(depth, y1 - y0, b - a);
        const mesh = new THREE.Mesh(geo, mat);
        const mid = (a + b) / 2;
        const off = fixed + (wall === 'top' || wall === 'left' ? inset : -inset);
        if (horiz) mesh.position.set(mid, (y0 + y1) / 2, off);
        else mesh.position.set(off, (y0 + y1) / 2, mid);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        into.add(mesh);
        return mesh;
      };

      // skirting board on the room side, clipped to the room's own length
      const skirt = (a, b) => {
        const lo = Math.max(a, 0);
        const hi = Math.min(b, info.len);
        if (hi - lo < 0.02) return;
        const m = piece(skirtMat, lo, hi, 0, 0.08, 0.016, T / 2 + 0.008);
        if (m) m.castShadow = false;
      };
      const ops = d.openings.filter((o) => o.wall === wall).sort((p, q) => p.pos - q.pos);
      let cur = a0;
      let stubCur = a0;
      for (const op of ops) {
        if (op.sill < STUB_H) {
          piece(stubMat, stubCur, op.pos, 0, STUB_H, T, 0, stub);
          piece(stubMat, op.pos, op.pos + op.width, 0, op.sill, T, 0, stub);
          stubCur = op.pos + op.width;
        }
        piece(wallMat, cur, op.pos, 0, H);
        skirt(cur, op.pos);
        if (op.sill > 0.1) skirt(op.pos, op.pos + op.width);
        const top = op.sill + op.height;
        piece(wallMat, op.pos, op.pos + op.width, 0, op.sill);
        piece(wallMat, op.pos, op.pos + op.width, top, H);
        const f = 0.05; // trim size
        const td = T + 0.02;
        piece(trimMat, op.pos - f, op.pos, op.sill, top + f, td);
        piece(trimMat, op.pos + op.width, op.pos + op.width + f, op.sill, top + f, td);
        piece(trimMat, op.pos - f, op.pos + op.width + f, top, top + f, td);
        if (op.type === 'window') {
          piece(trimMat, op.pos - f, op.pos + op.width + f, op.sill - 0.03, op.sill, T + 0.08, T / 2);
          piece(glassMat, op.pos, op.pos + op.width, op.sill, top, 0.01);
          piece(trimMat, op.pos + op.width / 2 - 0.02, op.pos + op.width / 2 + 0.02, op.sill, top, 0.04);
        } else {
          // door leaf, slightly ajar towards its swing so the direction reads in 3D
          const sw = doorSwing(d.room, op);
          const ang = sw.a1 + sw.d * 0.22;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(sw.r - 0.01, op.height - 0.01, 0.04), doorMat);
          const dir = { x: Math.cos(ang), y: Math.sin(ang) };
          // hinge sits on the inner face for inward doors, outer face for outward
          const face = sw.inward ? 0 : -T;
          const hx = sw.hinge.x + info.n.x * (face + (sw.inward ? 0.02 : -0.02));
          const hy = sw.hinge.y + info.n.y * (face + (sw.inward ? 0.02 : -0.02));
          leaf.position.set(hx + dir.x * sw.r / 2, op.height / 2, hy + dir.y * sw.r / 2);
          leaf.rotation.y = -ang;
          leaf.castShadow = true;
          group.add(leaf);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), trimMat);
          const kd = sw.r - 0.08;
          knob.position.set(hx + dir.x * kd, 1.0, hy + dir.y * kd);
          group.add(knob);
        }
        cur = op.pos + op.width;
      }
      piece(wallMat, cur, a1, 0, H);
      skirt(cur, a1);
      piece(stubMat, stubCur, a1, 0, STUB_H, T, 0, stub);
      stub.visible = false;

      const normal = new THREE.Vector3(-info.n.x, 0, -info.n.y); // outward
      const center = new THREE.Vector3(
        wall === 'left' ? 0 : wall === 'right' ? W : W / 2,
        H / 2,
        wall === 'top' ? 0 : wall === 'bottom' ? L : L / 2,
      );
      roomGroup.add(group, stub);
      walls.push({ group, stub, normal, center });
    }

    const span = Math.max(W, L);
    sun.position.set(W / 2 + span * 0.5, 7, L / 2 + span * 0.9);
    sun.target.position.set(W / 2, 0, L / 2);
  }

  function buildZones(d) {
    clearGroup(ensuiteGroup);
    ensuiteWalls = [];
    for (const e of [d.ensuite, d.walkin]) if (e) buildZone(d, e);
  }

  function buildZone(d, e) {
    const H = d.room.height;
    const L = ensuiteLayout(d.room, e);
    const r = L.interior;
    const iw = r.x1 - r.x0;
    const il = r.y1 - r.y0;
    if (e.id === 'ensuite') {
      tileTex.repeat.set(iw / tileTex.userData.tile, il / tileTex.userData.tile);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(iw, il), tileMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((r.x0 + r.x1) / 2, 0.002, (r.y0 + r.y1) / 2);
      floor.receiveShadow = true;
      ensuiteGroup.add(floor);
    }
    const wallMat = e.id === 'ensuite' ? bathWallMat : wallMatBase;

    const full = new THREE.Group();
    const stub = new THREE.Group();
    const slab = (into, mat, q, y0, y1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(q.x1 - q.x0, y1 - y0, q.y1 - q.y0), mat);
      m.position.set((q.x0 + q.x1) / 2, (y0 + y1) / 2, (q.y0 + q.y1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      into.add(m);
      return m;
    };
    for (const q of L.walls) {
      slab(full, wallMat, q, 0, H);
      slab(stub, wallMat, q, 0, ENS_CUT);
    }
    const doorH = Math.min(2.04, H - 0.08);
    slab(full, wallMat, L.gap, doorH, H);
    // door frame
    const g = L.gap;
    const f = 0.04;
    const jamb = L.vertical
      ? [{ x0: g.x0 - 0.01, y0: g.y0, x1: g.x1 + 0.01, y1: g.y0 + f }, { x0: g.x0 - 0.01, y0: g.y1 - f, x1: g.x1 + 0.01, y1: g.y1 }]
      : [{ x0: g.x0, y0: g.y0 - 0.01, x1: g.x0 + f, y1: g.y1 + 0.01 }, { x0: g.x1 - f, y0: g.y0 - 0.01, x1: g.x1, y1: g.y1 + 0.01 }];
    for (const q of jamb) slab(full, trimMatBase, q, 0, doorH);
    if (L.swing) {
      const sw = L.swing;
      const ang = sw.a1 + sw.d * 0.3;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(sw.r - 0.05, doorH - 0.02, 0.04), doorMatBase);
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const hx = sw.hinge.x + sw.m.x * 0.02;
      const hy = sw.hinge.y + sw.m.y * 0.02;
      leaf.position.set(hx + dir.x * (sw.r / 2), doorH / 2, hy + dir.y * (sw.r / 2));
      leaf.rotation.y = -ang;
      leaf.castShadow = true;
      full.add(leaf);
    } else {
      // sliding leaf parked beside the opening on the bedroom side
      const left = e.corner.endsWith('left');
      const top = e.corner.startsWith('top');
      const len = L.vertical ? g.y1 - g.y0 : g.x1 - g.x0;
      const q = L.vertical
        ? { x0: left ? g.x1 + 0.01 : g.x0 - 0.05, x1: left ? g.x1 + 0.05 : g.x0 - 0.01, y0: g.y0 + len * 0.55, y1: g.y1 + len * 0.55 }
        : { y0: top ? g.y1 + 0.01 : g.y0 - 0.05, y1: top ? g.y1 + 0.05 : g.y0 - 0.01, x0: g.x0 + len * 0.55, x1: g.x1 + len * 0.55 };
      slab(full, doorMatBase, q, 0.01, doorH - 0.01);
    }
    stub.visible = false;
    ensuiteGroup.add(full, stub);
    ensuiteWalls.push({ full, stub });

    for (const fx of L.fixtures) {
      const m = buildFixture3D(fx);
      m.position.set(fx.x, 0, fx.y);
      m.rotation.y = (-fx.rot * Math.PI) / 180;
      if (fx.flip) m.scale.x = -1;
      ensuiteGroup.add(m);
    }
  }

  function syncClosets(d) {
    const seen = new Set();
    for (const c of d.closets) {
      seen.add(c.id);
      const key = JSON.stringify(c.closet);
      let rec = closets.get(c.id);
      if (!rec || rec.key !== key) {
        if (rec) {
          disposeTree(rec.group);
          closetsGroup.remove(rec.group);
        }
        const group = buildCloset3D(c);
        group.traverse((o) => { o.userData.closetId = c.id; });
        closetsGroup.add(group);
        rec = { key, group };
        closets.set(c.id, rec);
      }
      rec.group.position.set(c.x, 0, c.y);
      rec.group.rotation.y = (-c.rot * Math.PI) / 180;
    }
    for (const [id, rec] of closets) {
      if (!seen.has(id)) {
        disposeTree(rec.group);
        closetsGroup.remove(rec.group);
        closets.delete(id);
      }
    }
  }

  function syncDesks(d) {
    const seen = new Set();
    for (const k of d.desks) {
      seen.add(k.id);
      const key = JSON.stringify({ ...k, x: 0, y: 0, rot: 0 });
      let rec = desks.get(k.id);
      if (!rec || rec.key !== key) {
        if (rec) {
          disposeTree(rec.group);
          desksGroup.remove(rec.group);
        }
        const group = buildSetup3D(k);
        group.traverse((o) => { o.userData.deskId = k.id; });
        desksGroup.add(group);
        rec = { key, group };
        desks.set(k.id, rec);
      }
      rec.group.position.set(k.x, 0, k.y);
      rec.group.rotation.y = (-k.rot * Math.PI) / 180;
    }
    for (const [id, rec] of desks) {
      if (!seen.has(id)) {
        disposeTree(rec.group);
        desksGroup.remove(rec.group);
        desks.delete(id);
      }
    }
  }

  function applyMode(d) {
    const night = d.lighting.mode === 'night';
    hemi.intensity = night ? 0.05 : 1.1;
    hemi.color.set(night ? 0x8a9bc4 : 0xffffff);
    sun.visible = !night;
    scene.environmentIntensity = night ? 0.03 : 0.55;
    groundMat.color.set(night ? 0x14161c : 0xdfe3e8);
    bloomOn = night;
    // the bloom pass draws an opaque frame, so night gets a real background colour
    scene.background = night ? nightSky : null;
    container.classList.toggle('night', night);
  }

  function emissiveMat(color, intensity) {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    return m;
  }

  function buildLights(d) {
    clearGroup(lightsGroup);
    cycling = [];
    const H = d.room.height;
    for (const l of d.lighting.lights) {
      const g = new THREE.Group();
      const color = new THREE.Color(TEMP_COLOR[l.temp]);
      const k = l.brightness / 100;
      let bulbY;
      const own = (mesh) => {
        mesh.userData.ownMaterial = true;
        mesh.userData.lightId = l.id;
        g.add(mesh);
        return mesh;
      };
      if (l.type === 'flush') {
        const base = own(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })));
        base.position.set(l.x, H - 0.01, l.y);
        const dome = own(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.05, 32), emissiveMat(color, 0.2 + 1.6 * k)));
        dome.position.set(l.x, H - 0.045, l.y);
        bulbY = H - 0.14;
      } else {
        const cordLen = l.cord;
        const cord = own(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, cordLen, 6), new THREE.MeshStandardMaterial({ color: 0x1b1b1b })));
        cord.position.set(l.x, H - cordLen / 2, l.y);
        const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
        const shade = own(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.19, 0.2, 32, 1, true), shadeMat));
        shade.position.set(l.x, H - cordLen - 0.1, l.y);
        shade.castShadow = true;
        const bulb = own(new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), emissiveMat(color, 0.4 + 2.6 * k)));
        bulb.position.set(l.x, H - cordLen - 0.13, l.y);
        bulbY = H - cordLen - 0.2;
      }
      const pl = new THREE.PointLight(color, 7 * k, 0, 2);
      pl.position.set(l.x, bulbY, l.y);
      pl.castShadow = k > 0;
      pl.shadow.mapSize.set(512, 512);
      pl.shadow.bias = -0.003;
      pl.shadow.camera.near = 0.05;
      pl.shadow.camera.far = 15;
      g.add(pl);
      lightsGroup.add(g);
    }

    for (const t of d.lighting.strips) {
      const segs = stripSegments(d, t);
      const color = new THREE.Color(t.on ? t.color : 0x55585f);
      const mat = t.on ? emissiveMat(color, 2.4) : new THREE.MeshStandardMaterial({ color: 0x55585f });
      const rec = { base: color.clone(), lights: [], mats: [mat] };
      for (const sg of segs) {
        const dx = sg.b.x - sg.a.x;
        const dz = sg.b.y - sg.a.y;
        const len = Math.hypot(dx, dz);
        if (len < 0.02) continue;
        const cx = (sg.a.x + sg.b.x) / 2;
        const cz = (sg.a.y + sg.b.y) / 2;
        const yaw = Math.atan2(-dz, dx);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.014), mat);
        bar.position.set(cx, sg.h, cz);
        bar.rotation.y = yaw;
        bar.userData.ownMaterial = true;
        bar.userData.stripId = t.id;
        lightsGroup.add(bar);
        if (!t.on) continue;
        const area = new THREE.RectAreaLight(color, 9, len, 0.16);
        if (sg.face) {
          area.position.set(cx - sg.face.x * 0.02, sg.h, cz - sg.face.y * 0.02);
          area.lookAt(cx + sg.face.x, sg.h - 0.7, cz + sg.face.y);
        } else {
          area.position.set(cx, sg.h - 0.01, cz);
          area.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
        }
        lightsGroup.add(area);
        rec.lights.push(area);
      }
      // ceiling edge: one wide light washing down from the ceiling instead of one per wall
      if (t.on && t.attach === 'ceiling' && rec.lights.length) {
        for (const l of rec.lights) lightsGroup.remove(l);
        const area = new THREE.RectAreaLight(color, 0.4, d.room.width - 0.1, d.room.length - 0.1);
        area.position.set(d.room.width / 2, d.room.height - 0.02, d.room.length / 2);
        area.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
        lightsGroup.add(area);
        rec.lights = [area];
      }
      // one downward light under the bed instead of one per side
      if (t.on && t.attach === 'bed' && rec.lights.length) {
        for (const l of rec.lights) lightsGroup.remove(l);
        const bed = d.beds.find((x) => x.id === t.target);
        const r = bedRect(bed);
        const area = new THREE.RectAreaLight(color, 6, r.x1 - r.x0 + 0.1, r.y1 - r.y0 + 0.1);
        area.position.set((r.x0 + r.x1) / 2, 0.05, (r.y0 + r.y1) / 2);
        area.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
        lightsGroup.add(area);
        rec.lights = [area];
      }
      if (t.on && t.effect === 'cycle') cycling.push(rec);
    }
  }

  // Start from the corner that faces the headboards and keeps the most openings in view.
  function eyeLevel(d) {
    const { width: W, length: L } = d.room;
    // stand in a doorway if there is one, else near the bottom wall, and look across the room
    const door = d.openings.find((o) => o.type === 'door');
    let p = { x: W / 2, y: L - 0.4 };
    if (door) {
      const w = wallInfo(d.room, door.wall);
      const mid = door.pos + door.width / 2;
      p = { x: w.start.x + w.u.x * mid + w.n.x * 0.35, y: w.start.y + w.u.y * mid + w.n.y * 0.35 };
    }
    const dir = new THREE.Vector3(W / 2 - p.x, 0, L / 2 - p.y).normalize();
    flyTo(new THREE.Vector3(p.x, 1.6, p.y), new THREE.Vector3(p.x + dir.x * 1.2, 1.35, p.y + dir.z * 1.2));
  }

  function frameCamera(d, animate = false) {
    const { width: W, length: L } = d.room;
    const R = Math.max(W, L);
    const heads = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' };
    const score = (wall) =>
      d.openings.reduce((n, o) => n + (o.wall === wall ? (o.type === 'door' ? 2 : 1) : 0), 0) +
      d.beds.reduce((n, b) => n + (heads[b.rot] === wall ? 3 : 0), 0) +
      d.desks.reduce((n, k) => n + (heads[k.rot] === wall ? 2 : 0), 0);
    let best = { sx: 1, sz: 1, v: -1 };
    for (const sz of [1, -1]) for (const sx of [1, -1]) {
      const v = score(sx > 0 ? 'left' : 'right') + score(sz > 0 ? 'top' : 'bottom');
      if (v > best.v) best = { sx, sz, v };
    }
    const target = new THREE.Vector3(W / 2, 0.5, L / 2);
    const pos = new THREE.Vector3(W / 2 + best.sx * R * 0.75, R * 1.15, L / 2 + best.sz * R * 1.25);
    if (animate) {
      flyTo(pos, target);
      return;
    }
    tween = null;
    controls.target.copy(target);
    camera.position.copy(pos);
    controls.update();
    dirty = true;
  }

  // ---------- WASD fly movement ----------
  // Moves the camera and its look-at point together, so dragging still turns the view.
  const keys = new Set();
  const MOVE_KEYS = ['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift'];
  const typing = (t) => t && t.matches && t.matches('input, select, textarea');
  window.addEventListener('keydown', (e) => {
    if (!active || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!MOVE_KEYS.includes(k)) return;
    keys.add(k);
    if (k === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const vel = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const want = new THREE.Vector3();
  let lastT = 0;
  function fly(dt) {
    want.set(0, 0, 0);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    if (keys.has('w')) want.add(fwd);
    if (keys.has('s')) want.sub(fwd);
    if (keys.has('d')) want.add(right);
    if (keys.has('a')) want.sub(right);
    if (keys.has('e') || keys.has(' ')) want.y += 1;
    if (keys.has('q')) want.y -= 1;
    const speed = keys.has('shift') ? 4.5 : 1.8; // metres per second
    if (want.lengthSq()) want.normalize().multiplyScalar(speed);
    // ease in and out so starts and stops aren't abrupt
    vel.lerp(want, 1 - Math.exp(-dt * 10));
    if (vel.lengthSq() < 1e-6) {
      vel.set(0, 0, 0);
      return false;
    }
    if (want.lengthSq()) {
      // keep the pivot close while walking so dragging looks around instead of swinging wide
      const dist = camera.position.distanceTo(controls.target);
      if (dist > 1.5) {
        const look = new THREE.Vector3();
        camera.getWorldDirection(look);
        controls.target.copy(camera.position).addScaledVector(look, 1.5);
      }
    }
    const step = vel.clone().multiplyScalar(dt);
    // don't sink below the floor
    if (camera.position.y + step.y < 0.15) step.y = 0.15 - camera.position.y;
    camera.position.add(step);
    controls.target.add(step);
    return true;
  }

  // Scrolling in past the pivot keeps moving forward instead of stalling.
  container.addEventListener('wheel', (e) => {
    if (e.deltaY >= 0) return;
    if (camera.position.distanceTo(controls.target) > 0.35) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const step = look.multiplyScalar(Math.min(0.5, -e.deltaY * 0.004));
    camera.position.add(step);
    controls.target.add(step);
    dirty = true;
  }, { capture: true, passive: false });

  function syncBeds(d) {
    const seen = new Set();
    for (const bed of d.beds) {
      seen.add(bed.id);
      const key = `${bed.region}|${bed.size}|${bed.frame}|${d.room.height}`;
      let rec = beds.get(bed.id);
      if (!rec || rec.key !== key) {
        if (rec) {
          disposeTree(rec.group);
          bedsGroup.remove(rec.group);
        }
        const group = buildBed3D(bed, d.room.height);
        group.traverse((o) => { o.userData.bedId = bed.id; });
        bedsGroup.add(group);
        rec = { key, group };
        beds.set(bed.id, rec);
      }
      rec.group.position.set(bed.x, 0, bed.y);
      rec.group.rotation.y = (-bed.rot * Math.PI) / 180;
    }
    for (const [id, rec] of beds) {
      if (!seen.has(id)) {
        disposeTree(rec.group);
        bedsGroup.remove(rec.group);
        beds.delete(id);
      }
    }
  }

  function syncOverlays(d) {
    clearGroup(overlayGroup);
    if (store.viewOnly) return; // a clean room to look at
    // overlays ignore lighting, so tone them down at night
    overlayGroup.userData.dim = d.lighting.mode === 'night' ? 0.4 : 1;
    const selD = store.selected;
    for (const k of d.desks) {
      const st = store.analysis.items[k.id];
      const showK = selD && selD.kind === 'desk' && selD.id === k.id;
      for (const strip of st.strips) {
        if (!showK && strip.ok) continue; // keep the 3D floor clean: zones show when selected or blocked
        overlayGroup.add(floorPoly(rectPts(strip.rect), strip.ok ? 0x22c55e : 0xf59e0b, strip.ok ? 0.14 : 0.35, 0.003));
      }
      const isSel = selD && selD.kind === 'desk' && selD.id === k.id;
      if (st.error || isSel) {
        for (const r of deskSolids(k)) {
          overlayGroup.add(floorPoly(rectPts({ x0: r.x0 - 0.04, y0: r.y0 - 0.04, x1: r.x1 + 0.04, y1: r.y1 + 0.04 }),
            st.error ? 0xdc2626 : 0x2563eb, st.error ? 0.45 : 0.35, 0.005));
        }
      }
    }
    const a = store.analysis;
    for (const op of d.openings) {
      if (op.type !== 'door') continue;
      const sw = doorSwing(d.room, op);
      const pts = [{ ...sw.hinge }];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const t = sw.a1 + (sw.d * i) / n;
        pts.push({ x: sw.hinge.x + Math.cos(t) * sw.r, y: sw.hinge.y + Math.sin(t) * sw.r });
      }
      overlayGroup.add(floorPoly(pts, sw.inward ? 0x2563eb : 0x6b7280, 0.16, 0.004));
    }
    const selC = store.selected;
    for (const c of d.closets) {
      const st = store.analysis.items[c.id];
      const show = selC && selC.kind === 'closet' && selC.id === c.id;
      for (const strip of st.strips) {
        if (!show && strip.ok) continue;
        overlayGroup.add(floorPoly(rectPts(strip.rect), strip.ok ? 0x22c55e : 0xf59e0b, strip.ok ? 0.14 : 0.35, 0.003));
      }
      if (st.error || show) {
        const r = bedRect(c);
        overlayGroup.add(floorPoly(rectPts({ x0: r.x0 - 0.04, y0: r.y0 - 0.04, x1: r.x1 + 0.04, y1: r.y1 + 0.04 }),
          st.error ? 0xdc2626 : 0x2563eb, st.error ? 0.45 : 0.35, 0.005));
      }
    }
    for (const zone of [d.ensuite, d.walkin]) {
      if (!zone) continue;
      const L = ensuiteLayout(d.room, zone);
      if (L.swing) {
        const sw = L.swing;
        const pts = [{ ...sw.hinge }];
        for (let i = 0; i <= 24; i++) {
          const t = sw.a1 + (sw.d * i) / 24;
          pts.push({ x: sw.hinge.x + Math.cos(t) * sw.r, y: sw.hinge.y + Math.sin(t) * sw.r });
        }
        overlayGroup.add(floorPoly(pts, 0x2563eb, 0.16, 0.004));
      }
      const err = store.analysis.items[zone.id].error;
      if (err || (store.selected && store.selected.kind === zone.id)) {
        const r = L.rect;
        overlayGroup.add(floorPoly(rectPts(r), err ? 0xdc2626 : 0x2563eb, 0.2, 0.004));
      }
    }
    const sel = store.selected;
    for (const bed of d.beds) {
      const st = a.beds[bed.id];
      const showB = sel && sel.kind === 'bed' && sel.id === bed.id;
      for (const strip of st.strips) {
        if (!showB && strip.ok) continue;
        overlayGroup.add(floorPoly(rectPts(strip.rect), strip.ok ? 0x22c55e : 0xf59e0b, strip.ok ? 0.16 : 0.35, 0.003));
      }
      const r = bedRect(bed);
      const isSel = sel && sel.kind === 'bed' && sel.id === bed.id;
      if (st.error || isSel) {
        const g = 0.04;
        overlayGroup.add(floorPoly(
          rectPts({ x0: r.x0 - g, y0: r.y0 - g, x1: r.x1 + g, y1: r.y1 + g }),
          st.error ? 0xdc2626 : 0x2563eb, st.error ? 0.45 : 0.35, 0.005,
        ));
      }
    }
  }

  function sync() {
    const d = store.design;
    const rk = JSON.stringify([d.room, d.openings]);
    if (rk !== roomKey) {
      roomKey = rk;
      buildRoom(d);
    }
    // reframe only for a new room size, never because furniture was added
    const fk = `${d.room.width}|${d.room.length}`;
    if (fk !== frameKey) {
      frameKey = fk;
      frameCamera(d);
    }
    const ek = JSON.stringify([d.room, d.ensuite, d.walkin]);
    if (ek !== ensuiteKey) {
      ensuiteKey = ek;
      buildZones(d);
    }
    syncBeds(d);
    syncDesks(d);
    syncClosets(d);
    const lk = JSON.stringify([d.room, d.lighting.lights, d.lighting.strips,
      d.lighting.strips.some((t) => t.attach !== 'ceiling') ? [d.beds, d.desks] : 0]);
    if (lk !== lightsKey) {
      lightsKey = lk;
      buildLights(d);
    }
    applyMode(d);
    syncOverlays(d);
    overlayGroup.traverse((o) => { if (o.material) o.material.opacity *= overlayGroup.userData.dim; });
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  // Cut away the walls between the camera and the room so the inside stays visible.
  function updateWallFade() {
    for (const w of walls) {
      const outside = camera.position.clone().sub(w.center).dot(w.normal) > 0;
      if (w.group.visible === outside) {
        renderer.shadowMap.needsUpdate = true;
        dirty = true;
      }
      w.group.visible = !outside;
      w.stub.visible = outside;
    }
    // ensuite walls drop to stubs whenever the camera is outside the room, so the bathroom shows from above
    if (ensuiteWalls.length) {
      const d = store.design;
      const p = camera.position;
      const out = p.x < 0 || p.z < 0 || p.x > d.room.width || p.z > d.room.length || p.y > d.room.height;
      for (const w of ensuiteWalls) {
        if (w.full.visible === out) {
          renderer.shadowMap.needsUpdate = true;
          dirty = true;
        }
        w.full.visible = !out;
        w.stub.visible = out;
      }
    }
  }

  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    composer.setSize(r.width, r.height);
    // bloom works at half resolution; it's a blur, so nobody can tell
    bloom.resolution.set(r.width / 2, r.height / 2);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(container);

  let active = false;
  const tmp = new THREE.Color();
  // render only when something moved, unless a strip is cycling colours
  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.05, ((now || 0) - lastT) / 1000 || 0.016);
    lastT = now || 0;
    if (fly(dt)) {
      tween = null;
      dirty = true;
    }
    if (stepTween(now || performance.now())) dirty = true;
    if (controls.update()) dirty = true;
    updateWallFade();
    if (cycling.length) {
      const hsl = {};
      for (const c of cycling) {
        c.base.getHSL(hsl);
        tmp.setHSL((hsl.h + (now || 0) / 16000) % 1, Math.max(0.6, hsl.s), Math.min(0.6, Math.max(0.45, hsl.l)));
        for (const l of c.lights) l.color.copy(tmp);
        for (const m of c.mats) {
          m.color.copy(tmp);
          m.emissive.copy(tmp);
        }
      }
      dirty = true;
    }
    if (dirty) {
      if (bloomOn) composer.render();
      else renderer.render(scene, camera);
      dirty = false;
    }
    requestAnimationFrame(loop);
  }

  // ---------- dragging beds on the floor ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let drag = null;
  let down = null;

  function setRay(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function floorHit() {
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, p) ? p : null;
  }
  function itemUnder() {
    const hits = ray.intersectObjects([...bedsGroup.children, ...desksGroup.children, ...closetsGroup.children], true).filter((h) => h.object.isMesh);
    if (!hits.length) return null;
    const u = hits[0].object.userData;
    if (u.bedId) return { kind: 'bed', id: u.bedId };
    if (u.closetId) return { kind: 'closet', id: u.closetId };
    if (u.deskId) return { kind: 'desk', id: u.deskId, part: u.part || 'desk' };
    return null;
  }

  container.addEventListener('pointerdown', (e) => {
    tween = null; // grabbing the view takes over from a camera move
    if (e.button !== 0) return;
    setRay(e);
    // in view-only mode every drag turns the camera
    const hit = store.viewOnly ? null : itemUnder();
    down = { x: e.clientX, y: e.clientY };
    if (!hit) return; // let the orbit controls handle it
    e.stopPropagation();
    e.preventDefault();
    const list = { bed: store.design.beds, desk: store.design.desks, closet: store.design.closets }[hit.kind];
    const bed = list.find((b) => b.id === hit.id);
    const p = floorHit();
    if (!bed || !p) return;
    store.select(hit);
    drag = { kind: hit.kind, id: hit.id, dx: p.x - bed.x, dz: p.z - bed.y };
    store.begin();
    container.setPointerCapture(e.pointerId);
  }, true);

  container.addEventListener('pointermove', (e) => {
    setRay(e);
    if (!drag) {
      renderer.domElement.style.cursor = !store.viewOnly && itemUnder() ? 'grab' : '';
      return;
    }
    renderer.domElement.style.cursor = 'grabbing';
    const p = floorHit();
    const d = store.design;
    const bed = { bed: d.beds, desk: d.desks, closet: d.closets }[drag.kind].find((b) => b.id === drag.id);
    if (!p || !bed) return;
    const np = snapBed(d.room, bed, p.x - drag.dx, p.z - drag.dz);
    if (np.x !== bed.x || np.y !== bed.y) store.preview(() => Object.assign(bed, np));
  });

  const finish = (e) => {
    if (drag) {
      drag = null;
      renderer.domElement.style.cursor = 'grab';
      store.end();
    } else if (down && e && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && store.selected) {
      store.select(null);
    }
    down = null;
  };
  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', () => finish(null));

  return {
    sync,
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) {
        resize();
        sync();
        requestAnimationFrame(loop);
      }
    },
    renderer,
    camera,
    controls,
    overview() {
      frameCamera(store.design, true);
    },
    eyeLevel() {
      eyeLevel(store.design);
    },
    redraw() {
      dirty = true;
    },
  };
}
