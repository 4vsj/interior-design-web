// Desk setup: desk, chair, monitor(s), keyboard and PC as one group.
// Local coords match beds: x across, y from back (-) to front (+), metres.

export const DESK_LIMITS = {
  width: { min: 0.8, max: 2.4 },
  depth: { min: 0.5, max: 1.0 },
  height: { min: 0.6, max: 1.1 },
};
export const CHAIR_ZONE = 0.75;

export const FINISHES = { wood: 'Wood', white: 'White', black: 'Black' };
const FINISH_COLOR = { wood: 0xa47851, white: 0xefeeea, black: 0x26272b };
const FINISH_2D = { wood: '#c79c72', white: '#f4f3ef', black: '#3a3b40' };

export const CHAIRS = { office: 'Office', gaming: 'Gaming' };

export const MONITORS = {
  24: { label: '24-inch', w: 0.541, h: 0.309 },
  27: { label: '27-inch', w: 0.608, h: 0.346 },
  32: { label: '32-inch', w: 0.719, h: 0.409 },
  34: { label: '34-inch ultrawide', w: 0.807, h: 0.344 },
};

export const KEYBOARDS = {
  full: { label: 'Full size', w: 0.44, d: 0.135 },
  tkl: { label: 'TKL', w: 0.36, d: 0.135 },
  60: { label: '60%', w: 0.29, d: 0.1 },
};

export const CASES = {
  mid: { label: 'Mid tower', w: 0.21, h: 0.46, d: 0.45 },
  sff: { label: 'Small form factor', w: 0.17, h: 0.33, d: 0.36 },
  showcase: { label: 'Showcase, glass side', w: 0.29, h: 0.47, d: 0.44 },
};

export const GPUS = {
  entry: { label: 'Entry tier', len: 0.18, fans: 1, thick: 0.035 },
  mid: { label: 'Mid tier', len: 0.26, fans: 2, thick: 0.045 },
  high: { label: 'High tier', len: 0.33, fans: 3, thick: 0.065 },
};

export const COOLERS = { air: 'Air tower', aio: 'AIO liquid with radiator' };

export const PARTS = {
  setup: 'Whole setup',
  desk: 'Desk',
  chair: 'Chair',
  monitor: 'Monitor',
  keyboard: 'Keyboard',
  pc: 'PC',
};

export function defaultSetup(id) {
  return {
    id,
    x: 0,
    y: 0,
    rot: 0,
    desk: { shape: 'straight', width: 1.4, depth: 0.7, height: 0.75, finish: 'wood' },
    chair: { style: 'office', color: '#3b4252' },
    monitor: { size: '27', count: 1 },
    keyboard: { layout: 'tkl', rgb: false },
    pc: { place: 'desk', style: 'mid', color: '#1d1f24', gpu: 'mid', cooler: 'air', rgb: true, rgbColor: '#22d3ee' },
  };
}

const returnLen = (W, D) => Math.max(1.0, Math.min(1.6, W * 0.8, D + 1.0));

/** Footprint of the desk itself (the chair sits outside it). */
export function deskFootprint(s) {
  const { width: W, depth: D, shape } = s.desk;
  return { w: W, l: shape === 'l' ? returnLen(W, D) : D };
}

/**
 * Where every piece sits, in local coords centred on the desk footprint.
 * Rects are {x0, y0, x1, y1}.
 */
export function deskLayout(s) {
  const { width: W, depth: D, shape } = s.desk;
  const { l: Lr } = deskFootprint(s);
  const top = -Lr / 2;
  const front = top + D;
  const isL = shape === 'l';
  const main = { x0: -W / 2, y0: top, x1: W / 2, y1: front };
  const ret = isL ? { x0: W / 2 - D, y0: front, x1: W / 2, y1: Lr / 2 } : null;

  const c = CASES[s.pc.style];
  let pc;
  if (isL) {
    const cx = W / 2 - D / 2;
    const cy = Lr / 2 - c.d / 2 - 0.04;
    pc = { x0: cx - c.w / 2, y0: cy - c.d / 2, x1: cx + c.w / 2, y1: cy + c.d / 2 };
  } else {
    const cx = W / 2 - c.w / 2 - 0.04;
    const cy = top + c.d / 2 + 0.04;
    pc = { x0: cx - c.w / 2, y0: cy - c.d / 2, x1: cx + c.w / 2, y1: cy + c.d / 2 };
  }

  // free width for monitors and keyboard on the main top
  let workX1 = isL ? W / 2 - D : W / 2;
  if (!isL && s.pc.place === 'desk') workX1 = pc.x0 - 0.03;
  const workX0 = -W / 2;
  const cx = (workX0 + workX1) / 2;

  const m = MONITORS[s.monitor.size];
  const n = s.monitor.count;
  const gap = 0.02;
  const monW = n * m.w + (n - 1) * gap;
  const monitors = [];
  for (let i = 0; i < n; i++) {
    const mx = cx - monW / 2 + m.w / 2 + i * (m.w + gap);
    monitors.push({ x: mx, y: top + 0.14, w: m.w, h: m.h, angle: n === 2 ? (i === 0 ? 1 : -1) * 0.2 : 0 });
  }
  const k = KEYBOARDS[s.keyboard.layout];
  const ky = front - 0.1 - k.d / 2;
  const keyboard = { x0: cx - k.w / 2 - 0.04, y0: ky - k.d / 2, x1: cx + k.w / 2 - 0.04, y1: ky + k.d / 2 };
  const cs = s.chair.style === 'gaming' ? 0.7 : 0.64;
  const chairY = front + 0.36;
  const chair = { x0: cx - cs / 2, y0: chairY - cs / 2, x1: cx + cs / 2, y1: chairY + cs / 2 };
  const chairZone = { x0: workX0, y0: front, x1: isL ? W / 2 - D : W / 2, y1: front + CHAIR_ZONE };
  const monitorRect = {
    x0: cx - monW / 2, y0: top + 0.06, x1: cx + monW / 2, y1: top + 0.22,
  };
  return {
    main, ret, solids: ret ? [main, ret] : [main], pc, monitors, monitorRect, keyboard, chair, chairZone,
    top, front, Lr, workX0, workX1, monTooWide: monW > workX1 - workX0 + 0.02,
  };
}

export function finish2D(s) {
  return FINISH_2D[s.desk.finish];
}

// ---------- 3D ----------

let M = null;
function mats(THREE) {
  if (M) return M;
  const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  M = {
    metal: std(0x2b2d31, 0.4, 0.6),
    plastic: std(0x18191c, 0.5),
    screen: new THREE.MeshStandardMaterial({ color: 0x0b0f17, roughness: 0.2, emissive: 0x24364f, emissiveIntensity: 0.9 }),
    board: std(0x15171b, 0.7),
    fin: std(0x9aa0a6, 0.35, 0.8),
    fanBlade: std(0x101114, 0.6),
    keycap: std(0x2a2c31, 0.7),
    glass: new THREE.MeshStandardMaterial({ color: 0xa8c2d6, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false }),
    rgbOff: std(0x2c2e33, 0.6),
  };
  return M;
}

export function buildSetup3D(THREE, RoundedBoxGeometry, s) {
  const Mt = mats(THREE);
  const g = new THREE.Group();
  const L = deskLayout(s);
  const H = s.desk.height;
  const own = (mat) => {
    mat.userData.own = true;
    return mat;
  };
  const finish = own(new THREE.MeshStandardMaterial({ color: FINISH_COLOR[s.desk.finish], roughness: 0.55 }));
  const rgbOn = s.pc.rgb;
  const rgb = own(new THREE.MeshStandardMaterial({
    color: s.pc.rgbColor, emissive: s.pc.rgbColor, emissiveIntensity: 2.2, roughness: 0.4,
  }));
  const kbRgb = own(new THREE.MeshStandardMaterial({
    color: s.pc.rgbColor, emissive: s.pc.rgbColor, emissiveIntensity: 1.6, roughness: 0.4,
  }));

  const tag = (mesh, part) => {
    mesh.userData.part = part;
    return mesh;
  };
  const box = (parent, mat, w, h, d, x, y0, z, part) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y0 + h / 2, z);
    parent.add(tag(mesh, part));
    return mesh;
  };
  const rect = (parent, mat, r, y0, h, part) => box(parent, mat, r.x1 - r.x0, h, r.y1 - r.y0, (r.x0 + r.x1) / 2, y0, (r.y0 + r.y1) / 2, part);

  // ----- desk -----
  for (const top of L.solids) rect(g, finish, top, H - 0.03, 0.03, 'desk');
  const legMat = s.desk.finish === 'wood' ? Mt.metal : finish;
  const legs = [];
  const m = L.main;
  const ins = 0.05;
  legs.push([m.x0 + ins, m.y0 + ins], [m.x0 + ins, m.y1 - ins], [m.x1 - ins, m.y0 + ins]);
  if (L.ret) legs.push([L.ret.x0 + ins, L.ret.y1 - ins], [L.ret.x1 - ins, L.ret.y1 - ins]);
  else legs.push([m.x1 - ins, m.y1 - ins]);
  for (const [x, z] of legs) box(g, legMat, 0.05, H - 0.03, 0.05, x, 0, z, 'desk');

  // ----- monitors -----
  for (const mon of L.monitors) {
    const mg = new THREE.Group();
    mg.position.set(mon.x, H, mon.y);
    mg.rotation.y = mon.angle;
    box(mg, Mt.plastic, 0.22, 0.012, 0.17, 0, 0, 0.0, 'monitor');
    box(mg, Mt.plastic, 0.04, 0.14, 0.03, 0, 0.012, -0.04, 'monitor');
    box(mg, Mt.plastic, mon.w, mon.h, 0.025, 0, 0.1, -0.02, 'monitor');
    const scr = box(mg, Mt.screen, mon.w - 0.012, mon.h - 0.012, 0.002, 0, 0.106, -0.0065, 'monitor');
    scr.userData.part = 'monitor';
    g.add(mg);
  }

  // ----- keyboard -----
  const k = L.keyboard;
  rect(g, Mt.plastic, k, H, 0.018, 'keyboard');
  rect(g, Mt.keycap, { x0: k.x0 + 0.008, y0: k.y0 + 0.008, x1: k.x1 - 0.008, y1: k.y1 - 0.008 }, H + 0.018, 0.01, 'keyboard');
  if (s.keyboard.rgb) {
    rect(g, kbRgb, { x0: k.x0 - 0.004, y0: k.y0 - 0.004, x1: k.x1 + 0.004, y1: k.y1 + 0.004 }, H, 0.004, 'keyboard');
  }
  // mouse
  box(g, Mt.plastic, 0.065, 0.035, 0.11, k.x1 + 0.12, H, (k.y0 + k.y1) / 2, 'keyboard');

  // ----- chair -----
  g.add(buildChair(THREE, s, L, tag));

  // ----- PC -----
  const pcG = buildPC(THREE, s, Mt, rgbOn ? rgb : Mt.rgbOff, own, tag);
  const pr = L.pc;
  const c = CASES[s.pc.style];
  const y0 = s.pc.place === 'desk' ? H : 0.01;
  pcG.position.set((pr.x0 + pr.x1) / 2, y0, (pr.y0 + pr.y1) / 2);
  g.add(pcG);
  if (rgbOn) {
    const glow = new THREE.PointLight(s.pc.rgbColor, 0.35, 1.4, 2);
    glow.position.set((pr.x0 + pr.x1) / 2 - c.w / 2 - 0.02, y0 + c.h * 0.55, (pr.y0 + pr.y1) / 2);
    g.add(glow);
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.material.transparent;
      o.receiveShadow = true;
      if (o.material.userData.own) o.userData.ownMaterial = true;
    }
  });
  return g;
}

function buildChair(THREE, s, L, tag) {
  const g = new THREE.Group();
  const cx = (L.chair.x0 + L.chair.x1) / 2;
  const cz = (L.chair.y0 + L.chair.y1) / 2;
  g.position.set(cx, 0, cz);
  const fabric = new THREE.MeshStandardMaterial({ color: s.chair.color, roughness: 0.85 });
  fabric.userData.own = true;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.3 });
  dark.userData.own = true;
  const box = (mat, w, h, d, x, y0, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y0 + h / 2, z);
    g.add(tag(m, 'chair'));
    return m;
  };
  // five-star base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(dark, 0.3, 0.03, 0.04, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), dark);
    w.position.set(Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
    g.add(tag(w, 'chair'));
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), dark);
  post.position.set(0, 0.26, 0);
  g.add(tag(post, 'chair'));
  const gaming = s.chair.style === 'gaming';
  const seatW = gaming ? 0.54 : 0.5;
  box(fabric, seatW, 0.09, 0.5, 0, 0.44, 0);
  // the chair faces the desk (-z); the back sits on +z
  const backH = gaming ? 0.82 : 0.56;
  const back = box(fabric, seatW - 0.02, backH, 0.07, 0, 0.55, 0.24);
  back.rotation.x = 0.1;
  if (gaming) {
    for (const sx of [-1, 1]) {
      box(fabric, 0.06, 0.5, 0.1, sx * (seatW / 2 - 0.01), 0.62, 0.22).rotation.x = 0.1;
      box(fabric, 0.07, 0.1, 0.46, sx * (seatW / 2 - 0.02), 0.5, 0);
    }
    box(dark, 0.26, 0.12, 0.06, 0, 1.18, 0.29);
    box(dark, 0.06, backH * 0.8, 0.075, 0, 0.62, 0.245).rotation.x = 0.1;
  }
  for (const sx of [-1, 1]) {
    box(dark, 0.04, 0.2, 0.04, sx * (seatW / 2 + 0.02), 0.53, 0.02);
    box(dark, 0.07, 0.025, 0.26, sx * (seatW / 2 + 0.02), 0.73, 0);
  }
  return g;
}

function fan(THREE, r, ringMat, Mt, tag) {
  const g = new THREE.Group();
  const blades = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.012, 18), Mt.fanBlade);
  blades.rotation.x = Math.PI / 2;
  g.add(tag(blades, 'pc'));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, r * 0.07, 6, 28), ringMat);
  g.add(tag(ring, 'pc'));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.016, 14), ringMat);
  hub.rotation.x = Math.PI / 2;
  g.add(tag(hub, 'pc'));
  return g; // faces +z
}

/** PC case with its glass side facing -x (towards the person at the desk). */
function buildPC(THREE, s, Mt, rgbMat, own, tag) {
  const g = new THREE.Group();
  const c = CASES[s.pc.style];
  const shell = own(new THREE.MeshStandardMaterial({ color: s.pc.color, roughness: 0.45, metalness: 0.2 }));
  const t = 0.006;
  const { w, h, d } = c;
  const box = (mat, bw, bh, bd, x, y0, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x, y0 + bh / 2, z);
    g.add(tag(m, 'pc'));
    return m;
  };
  const showcase = s.pc.style === 'showcase';
  const feet = showcase ? 0.03 : 0.012;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(Mt.plastic, 0.03, feet, 0.04, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.04));
  const y0 = feet;
  box(shell, w, t, d, 0, y0, 0); // bottom
  box(shell, w, t, d, 0, y0 + h - t, 0); // top
  box(shell, t, h, d, w / 2 - t / 2, y0, 0); // solid side (+x)
  box(shell, w, h, t, 0, y0, -d / 2 + t / 2); // back (-z, towards the wall)
  // front (+z, towards the room): glass on the showcase, solid elsewhere
  box(showcase ? Mt.glass : shell, w, h, t, 0, y0, d / 2 - t / 2);
  // side panel facing the user: clear glass, smoked glass, or mesh on the SFF
  if (s.pc.style === 'sff') box(shell, t, h, d, -w / 2 + t / 2, y0, 0);
  else box(showcase ? Mt.glass : Mt.smoke, t, h, d, -w / 2 + t / 2, y0, 0);

  // internals sit against the +x side
  const ix = w / 2 - t;
  box(Mt.board, 0.004, h * 0.62, d * 0.62, ix - 0.002, y0 + h * 0.3, -0.02);
  const gpu = GPUS[s.pc.gpu];
  const glen = Math.min(gpu.len, d - 0.06);
  if (showcase) {
    // vertical mount, fans facing the glass so the fan count reads
    const gx = ix - 0.06;
    box(Mt.plastic, gpu.thick, 0.12, glen, gx, y0 + 0.05, 0.01);
    box(rgbMat, gpu.thick + 0.002, 0.006, glen, gx, y0 + 0.17, 0.01);
    const fr = Math.min(0.045, glen / gpu.fans / 2 - 0.006);
    for (let i = 0; i < gpu.fans; i++) {
      const f = fan(THREE, fr, rgbMat, Mt, tag);
      f.rotation.y = -Math.PI / 2;
      const z = 0.01 - glen / 2 + (glen / gpu.fans) * (i + 0.5);
      f.position.set(gx - gpu.thick / 2 - 0.004, y0 + 0.11, z);
      g.add(f);
    }
  } else {
    // horizontal card below the CPU, fans facing down
    const gy = y0 + h * 0.34;
    const gw = Math.min(0.12, w - 0.06);
    box(Mt.plastic, gw, gpu.thick, glen, ix - gw / 2 - 0.004, gy, -d / 2 + glen / 2 + 0.02);
    box(rgbMat, 0.004, 0.006, glen, ix - gw - 0.006, gy + gpu.thick - 0.01, -d / 2 + glen / 2 + 0.02);
    const fr = Math.min(gw / 2 - 0.005, glen / gpu.fans / 2 - 0.005);
    for (let i = 0; i < gpu.fans; i++) {
      const f = fan(THREE, fr, rgbMat, Mt, tag);
      f.rotation.x = Math.PI / 2;
      f.position.set(ix - gw / 2 - 0.004, gy - 0.008, -d / 2 + 0.02 + (glen / gpu.fans) * (i + 0.5));
      g.add(f);
    }
  }
  // CPU cooler
  const cpuY = y0 + h * 0.68;
  const cpuZ = -0.04;
  if (s.pc.cooler === 'air') {
    const hw = Math.min(0.12, w - 0.07);
    box(Mt.fin, hw, 0.13, 0.06, ix - hw / 2 - 0.01, cpuY - 0.065, cpuZ);
    const f = fan(THREE, 0.055, rgbMat, Mt, tag);
    f.position.set(ix - hw / 2 - 0.01, cpuY, cpuZ + 0.04);
    g.add(f);
  } else {
    const pump = box(Mt.plastic, 0.035, 0.06, 0.06, ix - 0.02, cpuY - 0.03, cpuZ);
    pump.userData.part = 'pc';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 20), rgbMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(ix - 0.039, cpuY, cpuZ);
    g.add(tag(ring, 'pc'));
    // radiator along the top with two fans facing down
    const rl = Math.min(0.28, d - 0.08);
    const rw = Math.min(0.12, w - 0.04);
    box(Mt.fin, rw, 0.028, rl, 0, y0 + h - t - 0.03, 0);
    for (let i = 0; i < 2; i++) {
      const f = fan(THREE, Math.min(0.055, rl / 4 - 0.004), rgbMat, Mt, tag);
      f.rotation.x = Math.PI / 2;
      f.position.set(0, y0 + h - t - 0.04, -rl / 2 + (rl / 2) * (i + 0.5));
      g.add(f);
    }
    for (const dz of [-0.012, 0.012]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, h * 0.25, 8), Mt.plastic);
      tube.position.set(ix - 0.03, cpuY + h * 0.14, cpuZ + dz);
      g.add(tag(tube, 'pc'));
    }
  }
  // case fans: front intake and rear exhaust
  const fronts = s.pc.style === 'sff' ? 1 : 3;
  const ffr = Math.min(0.06, (h - 0.06) / fronts / 2 - 0.005);
  for (let i = 0; i < fronts; i++) {
    const f = fan(THREE, ffr, rgbMat, Mt, tag);
    f.position.set(0, y0 + 0.03 + ((h - 0.06) / fronts) * (i + 0.5), d / 2 - 0.02);
    g.add(f);
  }
  const rf = fan(THREE, Math.min(0.05, w / 2 - 0.02), rgbMat, Mt, tag);
  rf.position.set(0.01, y0 + h * 0.75, -d / 2 + 0.02);
  g.add(rf);
  return g;
}
