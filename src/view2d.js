// Top-down plan editor on a 2D canvas.
import { FRAMES, footprint, mattressOf, sizeShort } from './beds.js';
import {
  bedRect, doorSwing, fitOpening, GRID, openingEnds, pointInRect, snapBed, snapGrid, WALL_T, WALLS, wallInfo,
} from './geometry.js';
import { fmtLen } from './units.js';
import { deskLayout, finish2D } from './desks.js';
import { stripSegments, TEMP_COLOR } from './lighting.js';
import { deskSolids, deskName } from './geometry.js';

/** Plan point to a rotated item's local coords (head/back at -y). */
function toLocal(item, p) {
  const t = (item.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Which piece of a desk setup sits under a plan point, front-most first. */
export function deskPartAt(setup, p) {
  const L = deskLayout(setup);
  const q = toLocal(setup, p);
  const inR = (r, pad = 0) => q.x >= r.x0 - pad && q.x <= r.x1 + pad && q.y >= r.y0 - pad && q.y <= r.y1 + pad;
  if (inR(L.keyboard, 0.02)) return 'keyboard';
  if (inR(L.monitorRect, 0.02)) return 'monitor';
  if (inR(L.pc)) return 'pc';
  if (inR(L.chair)) return 'chair';
  if (L.solids.some((r) => inR(r))) return 'desk';
  return null;
}

const C = {
  bg: '#edf0f4',
  floor: '#fbfaf7',
  gridMinor: 'rgba(30,40,60,0.05)',
  gridMajor: 'rgba(30,40,60,0.13)',
  wall: '#3b3f46',
  text: '#2b2f36',
  muted: '#6b7280',
  accent: '#3358e0',
  error: '#dc2626',
  frame: '#c9a27c',
  frameDark: '#8b6a4c',
  mattress: '#ffffff',
  duvet: '#a9bbd1',
  pillow: '#f1f1f1',
  okStrip: 'rgba(22,163,74,0.10)',
  okStroke: 'rgba(22,163,74,0.45)',
  badStrip: 'rgba(217,119,6,0.20)',
  badStroke: 'rgba(217,119,6,0.8)',
  glass: '#cfe3f5',
};

export function createPlanView(canvas, store) {
  const ctx = canvas.getContext('2d');
  let s = 100; // px per metre
  let ox = 0;
  let oy = 0;
  let cw = 0;
  let ch = 0;
  let drag = null;

  const X = (x) => ox + x * s;
  const Y = (y) => oy + y * s;
  const toWorld = (px, py) => ({ x: (px - ox) / s, y: (py - oy) / s });

  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cw = r.width;
    ch = r.height;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fit(room) {
    const pad = Math.min(70, Math.max(36, Math.min(cw, ch) * 0.09));
    const W = room.width + 2 * WALL_T;
    const L = room.length + 2 * WALL_T;
    s = Math.max(10, Math.min((cw - 2 * pad) / W, (ch - 2 * pad) / L));
    ox = (cw - room.width * s) / 2;
    oy = (ch - room.length * s) / 2;
  }

  function wallBand(room, wall, a, b) {
    // rectangle (metres) covering the wall thickness between along-positions a..b
    const W = room.width;
    const L = room.length;
    const T = WALL_T;
    if (wall === 'top') return { x0: a, y0: -T, x1: b, y1: 0 };
    if (wall === 'bottom') return { x0: a, y0: L, x1: b, y1: L + T };
    if (wall === 'left') return { x0: -T, y0: a, x1: 0, y1: b };
    return { x0: W, y0: a, x1: W + T, y1: b };
  }

  const fillR = (r) => ctx.fillRect(X(r.x0), Y(r.y0), (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);
  const strokeR = (r) => ctx.strokeRect(X(r.x0), Y(r.y0), (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);

  function label(text, x, y, { size = 12, color = C.text, weight = 500, rotate = 0, bg = null } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (bg) {
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = bg;
      ctx.fillRect(-w / 2, -size * 0.75, w, size * 1.5);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawGrid(room) {
    const minor = GRID * s >= 6;
    ctx.lineWidth = 1;
    const lines = (step, color) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = step; x < room.width - 1e-6; x += step) {
        ctx.moveTo(Math.round(X(x)) + 0.5, Y(0));
        ctx.lineTo(Math.round(X(x)) + 0.5, Y(room.length));
      }
      for (let y = step; y < room.length - 1e-6; y += step) {
        ctx.moveTo(X(0), Math.round(Y(y)) + 0.5);
        ctx.lineTo(X(room.width), Math.round(Y(y)) + 0.5);
      }
      ctx.stroke();
    };
    if (minor) lines(GRID, C.gridMinor);
    lines(1, C.gridMajor);
  }

  function drawBed(bed, st, selected) {
    const m = mattressOf(bed);
    const f = FRAMES[bed.frame];
    const { w, l } = footprint(bed);
    ctx.save();
    ctx.translate(X(bed.x), Y(bed.y));
    ctx.rotate((bed.rot * Math.PI) / 180);
    const R = (x0, y0, x1, y1) => [x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s];
    const hw = w / 2;
    const hl = l / 2;
    // frame, with a soft drop shadow so furniture sits above the floor
    ctx.fillStyle = bed.frame === 'panel' || bed.frame === 'storage' ? '#b9b2a6' : C.frame;
    softShadow(() => ctx.fillRect(...R(-hw, -hl, hw, hl)));
    // headboard
    ctx.fillStyle = bed.frame === 'panel' ? '#7d808a' : C.frameDark;
    ctx.fillRect(...R(-hw, -hl, hw, -hl + f.head));
    // mattress
    const my0 = -hl + f.head;
    const my1 = hl - f.foot;
    ctx.fillStyle = C.mattress;
    ctx.fillRect(...R(-m.w / 2, my0, m.w / 2, my1));
    // duvet
    ctx.fillStyle = C.duvet;
    ctx.fillRect(...R(-m.w / 2, my1 - m.l * 0.68, m.w / 2, my1));
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-m.w / 2 * s, (my1 - m.l * 0.68 + 0.18) * s);
    ctx.lineTo(m.w / 2 * s, (my1 - m.l * 0.68 + 0.18) * s);
    ctx.stroke();
    // pillows
    const count = m.w < 1.2 ? 1 : 2;
    const pw = Math.min(0.66, (m.w - 0.12) / count - 0.04);
    ctx.fillStyle = C.pillow;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < count; i++) {
      const cx = count === 1 ? 0 : (i === 0 ? -1 : 1) * (m.w / 4);
      const r = R(cx - pw / 2, my0 + 0.07, cx + pw / 2, my0 + 0.43);
      ctx.beginPath();
      ctx.roundRect(...r, 0.05 * s);
      ctx.fill();
      ctx.stroke();
    }
    if (bed.frame === 'fourposter') {
      ctx.fillStyle = C.frameDark;
      const p = f.head;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const cx = sx * (hw - p / 2);
        const cy = sy * (hl - p / 2);
        ctx.fillRect(...R(cx - p / 2, cy - p / 2, cx + p / 2, cy + p / 2));
      }
    }
    if (bed.frame === 'storage') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      for (const sx of [-1, 1]) {
        for (const yy of [-0.15, 0.45]) {
          ctx.beginPath();
          ctx.moveTo(sx * hw * s, (yy - 0.12) * s);
          ctx.lineTo(sx * hw * s, (yy + 0.12) * s);
          ctx.stroke();
        }
      }
    }
    // outline
    ctx.lineWidth = selected ? 2.5 : 1.25;
    ctx.strokeStyle = st.error ? C.error : selected ? C.accent : 'rgba(0,0,0,0.45)';
    if (st.error) {
      ctx.fillStyle = 'rgba(220,38,38,0.10)';
      ctx.fillRect(...R(-hw, -hl, hw, hl));
      ctx.lineWidth = 2.5;
    }
    ctx.strokeRect(...R(-hw, -hl, hw, hl));
    ctx.restore();
    // upright label in the middle
    const fs = Math.max(10, Math.min(14, s * 0.11));
    label(sizeShort(bed), X(bed.x), Y(bed.y) - fs * 0.65, { size: fs, weight: 600, bg: 'rgba(255,255,255,0.75)' });
    label(f.label, X(bed.x), Y(bed.y) + fs * 0.75, { size: fs * 0.9, color: C.muted, bg: 'rgba(255,255,255,0.75)' });
  }

  function drawOpening(d, op, selected) {
    const room = d.room;
    const band = wallBand(room, op.wall, op.pos, op.pos + op.width);
    if (op.type === 'window') {
      ctx.fillStyle = '#ffffff';
      fillR(band);
      ctx.fillStyle = C.glass;
      const w = wallInfo(room, op.wall);
      const horiz = w.u.x !== 0;
      const inset = WALL_T * 0.35;
      const g = horiz
        ? { x0: band.x0, x1: band.x1, y0: band.y0 + inset, y1: band.y1 - inset }
        : { x0: band.x0 + inset, x1: band.x1 - inset, y0: band.y0, y1: band.y1 };
      fillR(g);
      ctx.strokeStyle = C.wall;
      ctx.lineWidth = 1.5;
      strokeR(band);
      ctx.beginPath();
      if (horiz) {
        const yc = Y((band.y0 + band.y1) / 2);
        ctx.moveTo(X(band.x0), yc);
        ctx.lineTo(X(band.x1), yc);
      } else {
        const xc = X((band.x0 + band.x1) / 2);
        ctx.moveTo(xc, Y(band.y0));
        ctx.lineTo(xc, Y(band.y1));
      }
      ctx.stroke();
    } else {
      const sw = doorSwing(room, op);
      ctx.fillStyle = C.floor;
      fillR(band);
      // swing area
      ctx.beginPath();
      ctx.moveTo(X(sw.hinge.x), Y(sw.hinge.y));
      ctx.arc(X(sw.hinge.x), Y(sw.hinge.y), sw.r * s, sw.a1, sw.a1 + sw.d, sw.d < 0);
      ctx.closePath();
      ctx.fillStyle = sw.inward ? 'rgba(37,99,235,0.07)' : 'rgba(107,114,128,0.07)';
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(55,65,81,0.7)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(X(sw.hinge.x), Y(sw.hinge.y), sw.r * s, sw.a1, sw.a1 + sw.d, sw.d < 0);
      ctx.stroke();
      ctx.setLineDash([]);
      // leaf, drawn fully open
      const end = { x: sw.hinge.x + sw.m.x * sw.r, y: sw.hinge.y + sw.m.y * sw.r };
      ctx.strokeStyle = C.wall;
      ctx.lineWidth = Math.max(2, 0.04 * s);
      ctx.beginPath();
      ctx.moveTo(X(sw.hinge.x), Y(sw.hinge.y));
      ctx.lineTo(X(end.x), Y(end.y));
      ctx.stroke();
      // jambs
      ctx.fillStyle = C.wall;
      for (const p of [sw.hinge, sw.other]) ctx.fillRect(X(p.x) - 2, Y(p.y) - 2, 4, 4);
    }
    if (selected) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      const pad = 0.04;
      strokeR({ x0: band.x0 - pad, y0: band.y0 - pad, x1: band.x1 + pad, y1: band.y1 + pad });
    }
  }

  function drawGaps(d, bed) {
    const r = bedRect(bed);
    const { width: W, length: L } = d.room;
    const u = d.units;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const segs = [
      [0, cy, r.x0, cy, r.x0],
      [r.x1, cy, W, cy, W - r.x1],
      [cx, 0, cx, r.y0, r.y0],
      [cx, r.y1, cx, L, L - r.y1],
    ];
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1;
    for (const [x0, y0, x1, y1, len] of segs) {
      if (len < 0.02) continue;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(x0), Y(y0));
      ctx.lineTo(X(x1), Y(y1));
      ctx.stroke();
      ctx.setLineDash([]);
      label(fmtLen(len, u), X((x0 + x1) / 2), Y((y0 + y1) / 2), { size: 11, color: C.accent, bg: 'rgba(255,255,255,0.9)' });
    }
  }

  function softShadow(fn) {
    ctx.save();
    ctx.shadowColor = 'rgba(20, 28, 45, 0.22)';
    ctx.shadowBlur = Math.max(6, s * 0.08);
    ctx.shadowOffsetY = Math.max(2, s * 0.02);
    fn();
    ctx.restore();
  }

  function drawDesk(d, setup, st, sel) {
    const L = deskLayout(setup);
    const part = sel && sel.kind === 'desk' && sel.id === setup.id ? sel.part || 'setup' : null;
    ctx.save();
    ctx.translate(X(setup.x), Y(setup.y));
    ctx.rotate((setup.rot * Math.PI) / 180);
    const R = (r) => [r.x0 * s, r.y0 * s, (r.x1 - r.x0) * s, (r.y1 - r.y0) * s];
    const outline = (r, on) => {
      if (!on) return;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(...R({ x0: r.x0 - 0.015, y0: r.y0 - 0.015, x1: r.x1 + 0.015, y1: r.y1 + 0.015 }));
    };
    // chair first so the desk edge draws over its front
    const c = L.chair;
    ctx.fillStyle = setup.chair.color;
    ctx.beginPath();
    ctx.roundRect(...R(c), 0.1 * s);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(...R({ x0: c.x0 + 0.06, y0: c.y1 - 0.12, x1: c.x1 - 0.06, y1: c.y1 - 0.04 }));
    outline(c, part === 'chair');
    // floor PC under the desk shows dashed
    const floorPc = setup.pc.place === 'floor';
    if (floorPc) {
      ctx.fillStyle = setup.pc.color;
      ctx.fillRect(...R(L.pc));
    }
    ctx.fillStyle = finish2D(setup);
    softShadow(() => { for (const r of L.solids) ctx.fillRect(...R(r)); });
    ctx.strokeStyle = st.error ? C.error : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = st.error ? 2.5 : 1.25;
    for (const r of L.solids) ctx.strokeRect(...R(r));
    if (floorPc) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(...R(L.pc));
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = setup.pc.color;
      ctx.fillRect(...R(L.pc));
      if (setup.pc.rgb) {
        ctx.fillStyle = setup.pc.rgbColor;
        ctx.fillRect(...R({ x0: L.pc.x0, y0: L.pc.y0 + 0.03, x1: L.pc.x0 + 0.02, y1: L.pc.y1 - 0.03 }));
      }
    }
    outline(L.pc, part === 'pc');
    // monitors
    ctx.fillStyle = '#1f2125';
    for (const m of L.monitors) {
      ctx.save();
      ctx.translate(m.x * s, m.y * s);
      ctx.rotate(-m.angle);
      ctx.fillRect((-m.w / 2) * s, -0.02 * s, m.w * s, 0.03 * s);
      ctx.fillRect(-0.11 * s, -0.01 * s, 0.22 * s, 0.09 * s);
      ctx.restore();
    }
    outline(L.monitorRect, part === 'monitor');
    // keyboard
    ctx.fillStyle = setup.keyboard.rgb ? setup.pc.rgbColor : '#55585f';
    ctx.fillRect(...R(L.keyboard));
    ctx.fillStyle = '#2a2c31';
    const k = L.keyboard;
    ctx.fillRect(...R({ x0: k.x0 + 0.008, y0: k.y0 + 0.008, x1: k.x1 - 0.008, y1: k.y1 - 0.008 }));
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(...R(k));
    outline(k, part === 'keyboard');
    for (const r of L.solids) outline(r, part === 'desk' || part === 'setup');
    if (st.error) {
      ctx.fillStyle = 'rgba(220,38,38,0.10)';
      for (const r of L.solids) ctx.fillRect(...R(r));
    }
    ctx.restore();
    const fs = Math.max(10, Math.min(13, s * 0.1));
    const lp = deskSolids(setup)[0];
    label(deskName(d, setup), X((lp.x0 + lp.x1) / 2), Y((lp.y0 + lp.y1) / 2), { size: fs, weight: 600, bg: 'rgba(255,255,255,0.75)' });
  }

  function drawLight(l, selected) {
    const r = Math.max(9, 0.14 * s);
    const x = X(l.x);
    const y = Y(l.y);
    ctx.fillStyle = TEMP_COLOR[l.temp];
    ctx.strokeStyle = selected ? C.accent : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (l.type === 'pendant') {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // rays sized by brightness
    ctx.strokeStyle = 'rgba(180,120,20,0.6)';
    ctx.lineWidth = 1.5;
    const len = r * (0.3 + l.brightness / 160);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
      ctx.lineTo(x + Math.cos(a) * (r + 3 + len), y + Math.sin(a) * (r + 3 + len));
      ctx.stroke();
    }
  }

  function drawStrip(d, strip, selected) {
    const segs = stripSegments(d, strip);
    ctx.save();
    ctx.lineCap = 'round';
    for (const g of segs) {
      if (selected) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(X(g.a.x), Y(g.a.y));
        ctx.lineTo(X(g.b.x), Y(g.b.y));
        ctx.stroke();
      }
      ctx.strokeStyle = strip.on ? strip.color : '#9ca3af';
      ctx.lineWidth = 4;
      ctx.setLineDash(strip.on ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(X(g.a.x), Y(g.a.y));
      ctx.lineTo(X(g.b.x), Y(g.b.y));
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    layout();
    const d = store.design;
    const room = d.room;
    fit(room);
    const a = store.analysis;
    const sel = store.selected;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cw, ch);
    // walls as a band around the floor
    ctx.fillStyle = C.wall;
    fillR({ x0: -WALL_T, y0: -WALL_T, x1: room.width + WALL_T, y1: room.length + WALL_T });
    ctx.fillStyle = C.floor;
    fillR({ x0: 0, y0: 0, x1: room.width, y1: room.length });
    drawGrid(room);

    // walkway and chair zones under the furniture
    for (const item of [...d.beds, ...d.desks]) {
      for (const strip of a.items[item.id].strips) {
        ctx.fillStyle = strip.ok ? C.okStrip : C.badStrip;
        fillR(strip.rect);
        ctx.strokeStyle = strip.ok ? C.okStroke : C.badStroke;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        strokeR(strip.rect);
        ctx.setLineDash([]);
      }
    }

    for (const op of d.openings) drawOpening(d, op, sel && sel.kind === 'opening' && sel.id === op.id);
    for (const bed of d.beds) drawBed(bed, a.beds[bed.id], sel && sel.kind === 'bed' && sel.id === bed.id);
    for (const k of d.desks) drawDesk(d, k, a.items[k.id], sel);
    for (const t of d.lighting.strips) drawStrip(d, t, sel && sel.kind === 'strip' && sel.id === t.id);
    for (const l of d.lighting.lights) drawLight(l, sel && sel.kind === 'light' && sel.id === l.id);

    // room dimensions
    const u = d.units;
    label(fmtLen(room.width, u), X(room.width / 2), Y(-WALL_T) - 14, { size: 12, color: C.muted });
    label(fmtLen(room.length, u), X(-WALL_T) - 16, Y(room.length / 2), { size: 12, color: C.muted, rotate: -Math.PI / 2 });

    const selBed = sel && (sel.kind === 'bed' || sel.kind === 'desk') && store.selectedItem();
    if (selBed) drawGaps(d, selBed);

    if (!d.beds.length && !d.openings.length && !d.desks.length) {
      label('Set the room size, then add a door, a window and a bed from the panel.', cw / 2, ch - 22, { size: 13, color: C.muted });
    }
  }

  // ---------- interaction ----------

  function hitTest(p) {
    const d = store.design;
    const lr = Math.max(9, 0.14 * s) / s + 0.03;
    for (const l of [...d.lighting.lights].reverse()) {
      if (Math.hypot(p.x - l.x, p.y - l.y) <= lr) return { kind: 'light', id: l.id };
    }
    for (const op of [...d.openings].reverse()) {
      const w = wallInfo(d.room, op.wall);
      const rel = { x: p.x - w.start.x, y: p.y - w.start.y };
      const along = rel.x * w.u.x + rel.y * w.u.y;
      const perp = rel.x * w.n.x + rel.y * w.n.y;
      if (along >= op.pos - 0.05 && along <= op.pos + op.width + 0.05 && perp >= -WALL_T - 0.12 && perp <= 0.15) {
        return { kind: 'opening', id: op.id, along };
      }
    }
    for (const k of [...d.desks].reverse()) {
      const part = deskPartAt(k, p);
      if (part) return { kind: 'desk', id: k.id, part };
    }
    for (const bed of [...d.beds].reverse()) {
      if (pointInRect(p, bedRect(bed))) return { kind: 'bed', id: bed.id };
    }
    // strips are thin, so give them a generous hit band
    for (const t of [...d.lighting.strips].reverse()) {
      for (const g of stripSegments(d, t)) {
        const vx = g.b.x - g.a.x;
        const vy = g.b.y - g.a.y;
        const len2 = vx * vx + vy * vy || 1;
        const u = Math.max(0, Math.min(1, ((p.x - g.a.x) * vx + (p.y - g.a.y) * vy) / len2));
        if (Math.hypot(p.x - g.a.x - u * vx, p.y - g.a.y - u * vy) < 0.06) return { kind: 'strip', id: t.id };
      }
    }
    return null;
  }

  function nearestWall(room, p, current) {
    const dist = {
      top: Math.abs(p.y),
      bottom: Math.abs(p.y - room.length),
      left: Math.abs(p.x),
      right: Math.abs(p.x - room.width),
    };
    let best = current;
    for (const w of WALLS) if (dist[w] < dist[best] - 0.25) best = w;
    return best;
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    return toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = pointer(e);
    const h = hitTest(p);
    if (!h) {
      store.select(null);
      return;
    }
    store.select({ kind: h.kind, id: h.id, part: h.part });
    if (h.kind === 'strip') return;
    const item = store.selectedItem();
    store.begin();
    if (h.kind === 'opening') drag = { kind: 'opening', id: h.id, grab: h.along - item.pos };
    else drag = { kind: h.kind, id: h.id, dx: p.x - item.x, dy: p.y - item.y };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointer(e);
    if (!drag) {
      canvas.style.cursor = hitTest(p) ? 'grab' : 'default';
      return;
    }
    canvas.style.cursor = 'grabbing';
    const d = store.design;
    if (drag.kind === 'bed' || drag.kind === 'desk') {
      // dragging any piece of a desk setup moves the whole group
      const bed = (drag.kind === 'bed' ? d.beds : d.desks).find((b) => b.id === drag.id);
      if (!bed) return;
      const np = snapBed(d.room, bed, p.x - drag.dx, p.y - drag.dy);
      if (np.x !== bed.x || np.y !== bed.y) store.preview(() => Object.assign(bed, np));
    } else if (drag.kind === 'light') {
      const l = d.lighting.lights.find((x) => x.id === drag.id);
      if (!l) return;
      const nx = Math.min(d.room.width, Math.max(0, snapGrid(p.x - drag.dx)));
      const ny = Math.min(d.room.length, Math.max(0, snapGrid(p.y - drag.dy)));
      if (nx !== l.x || ny !== l.y) store.preview(() => Object.assign(l, { x: nx, y: ny }));
    } else {
      const op = d.openings.find((o) => o.id === drag.id);
      if (!op) return;
      const wall = nearestWall(d.room, p, op.wall);
      if (wall !== op.wall) drag.grab = op.width / 2;
      const w = wallInfo(d.room, wall);
      const along = (p.x - w.start.x) * w.u.x + (p.y - w.start.y) * w.u.y;
      const pos = fitOpening(d, op, wall, snapGrid(along - drag.grab));
      if (pos !== null && (pos !== op.pos || wall !== op.wall)) {
        store.preview(() => {
          op.wall = wall;
          op.pos = pos;
        });
      }
    }
  });

  const finish = () => {
    if (!drag) return;
    drag = null;
    canvas.style.cursor = 'grab';
    store.end();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  new ResizeObserver(() => draw()).observe(canvas);

  return { draw };
}

export { openingEnds };
