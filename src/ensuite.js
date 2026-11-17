// Ensuite bathroom: a rectangle in one corner of the room, closed off by two
// partition walls, with a door in one of them and fixtures along the outer walls.
// Plan coords, metres. Layout is worked out for a top-left ensuite and mirrored.

export const ENS_T = 0.1; // partition thickness, inside the ensuite rectangle
export const CORNERS = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' };
export const WET = { shower: 'Shower', bath: 'Bath', none: 'Neither' };
export const ENS_DOORS = { in: 'Swings into bathroom', out: 'Swings into bedroom', sliding: 'Sliding' };
export const ENS_LIMITS = { size: { min: 1.2, max: 4.0 }, door: { min: 0.6, max: 0.9 } };
export const FIXTURE_NAME = {
  shower: 'shower', bath: 'bath', toilet: 'toilet', vanity: 'vanity', rail: 'hanging rail', shelves: 'shelves', bench: 'bench', mirror: 'mirror',
};
// walk-in closet: the same walled-off corner, fitted out for clothes instead
export const STORAGE = { one: 'Hanging rail on one wall', two: 'Rail plus shelves and drawers' };
export const ZONE_NAME = { ensuite: 'the ensuite', walkin: 'the walk-in closet' };
const RAIL_D = 0.6;
const SHELF_D = 0.45;
export const STAND = 0.8; // clear floor to stand and get changed

// w across (along the wall), l out from the wall; run is the wall length one takes up
const FIX = {
  shower: { w: 0.9, l: 0.9 },
  bath: { w: 1.7, l: 0.75 },
  vanity: { w: 0.6, l: 0.46, run: 0.75 },
  toilet: { w: 0.38, l: 0.7, run: 0.8 },
};
const HEAD_ROT = { top: 0, right: 90, bottom: 180, left: 270 };
const GAP = 0.05; // smallest bit of wall beside the door

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isLeft = (e) => e.corner.endsWith('left');
const isTop = (e) => e.corner.startsWith('top');

export function defaultEnsuite(room) {
  const e = {
    id: 'ensuite', corner: 'top-right', width: 1.8, length: 2.1,
    doorSide: 'v', doorAt: 99, doorWidth: 0.72, door: 'in', wet: 'shower', toilet: true, vanity: true,
  };
  clampEnsuite(room, e);
  return e;
}

export function defaultWalkin(room) {
  const e = {
    id: 'walkin', corner: 'bottom-left', width: 2.0, length: 2.0,
    doorSide: 'v', doorAt: 99, doorWidth: 0.72, door: 'in', storage: 'two', mirror: true, bench: true, finish: 'white',
  };
  clampEnsuite(room, e);
  return e;
}

/** Door range along its partition: [min, max] distance from the outer wall. */
export function doorRange(e) {
  const inner = (e.doorSide === 'v' ? e.length : e.width) - ENS_T;
  return [GAP, Math.max(GAP, inner - e.doorWidth - GAP)];
}

/** Keep sizes inside the room and the door inside its wall. Mutates e. */
export function clampEnsuite(room, e) {
  const { min, max } = ENS_LIMITS.size;
  // leave at least 60 cm of bedroom beside it
  e.width = clamp(e.width, min, Math.max(min, Math.min(max, room.width - 0.6)));
  e.length = clamp(e.length, min, Math.max(min, Math.min(max, room.length - 0.6)));
  const inner = (e.doorSide === 'v' ? e.length : e.width) - ENS_T;
  e.doorWidth = clamp(e.doorWidth, ENS_LIMITS.door.min, Math.min(ENS_LIMITS.door.max, inner - 2 * GAP));
  const [a, b] = doorRange(e);
  e.doorAt = clamp(e.doorAt, a, b);
  return e;
}

/** Labels for the two partition walls, by the side of the room they face. */
export function sideLabels(e) {
  return { v: isLeft(e) ? 'Right side' : 'Left side', h: isTop(e) ? 'Bottom side' : 'Top side' };
}
/** What the door position is measured from. */
export function doorFromLabel(e) {
  if (e.doorSide === 'v') return isTop(e) ? 'Door from top wall' : 'Door from bottom wall';
  return isLeft(e) ? 'Door from left wall' : 'Door from right wall';
}

function swingFrom(hinge, other, m, r, inward) {
  const s = { x: (other.x - hinge.x) / r, y: (other.y - hinge.y) / r };
  const a1 = Math.atan2(s.y, s.x);
  let d = Math.atan2(m.y, m.x) - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  const far = { x: hinge.x + s.x * r + m.x * r, y: hinge.y + s.y * r + m.y * r };
  const box = {
    x0: Math.min(hinge.x, far.x), y0: Math.min(hinge.y, far.y),
    x1: Math.max(hinge.x, far.x), y1: Math.max(hinge.y, far.y),
  };
  return { hinge, other, r, s, m, a1, d, inward, box };
}

/**
 * Everything needed to draw and check the ensuite:
 * rect (outer), interior, walls (solid partition pieces), gap (door hole),
 * swing (null for sliding), fixtures [{type, rect, x, y, rot, w, l}], missing [type].
 */
export function ensuiteLayout(room, e) {
  const T = ENS_T;
  const W = room.width;
  const L = room.length;
  const left = isLeft(e);
  const top = isTop(e);
  const w = e.width;
  const l = e.length;
  const iw = w - T;
  const il = l - T;
  const px = (x) => (left ? x : W - x);
  const py = (y) => (top ? y : L - y);
  const R = (r) => {
    const xa = px(r.x0); const xb = px(r.x1); const ya = py(r.y0); const yb = py(r.y1);
    return { x0: Math.min(xa, xb), y0: Math.min(ya, yb), x1: Math.max(xa, xb), y1: Math.max(ya, yb) };
  };
  const P = (p) => ({ x: px(p.x), y: py(p.y) });
  const v = e.doorSide === 'v';
  const da = e.doorAt;
  const dw = e.doorWidth;

  const gapC = v ? { x0: iw, y0: da, x1: w, y1: da + dw } : { x0: da, y0: il, x1: da + dw, y1: l };
  const wallsC = v
    ? [{ x0: iw, y0: 0, x1: w, y1: da }, { x0: iw, y0: da + dw, x1: w, y1: l }, { x0: 0, y0: il, x1: iw, y1: l }]
    : [{ x0: 0, y0: il, x1: da, y1: l }, { x0: da + dw, y0: il, x1: w, y1: l }, { x0: iw, y0: 0, x1: w, y1: il }];

  // hinge on the end nearer the corner of the two partitions; the leaf hangs on the face it opens to
  let swing = null;
  if (e.door !== 'sliding') {
    const into = e.door === 'in' ? -1 : 1;
    const face = v ? (e.door === 'in' ? iw : w) : (e.door === 'in' ? il : l);
    const hinge = v ? { x: face, y: da + dw } : { x: da + dw, y: face };
    const other = v ? { x: face, y: da } : { x: da, y: face };
    const m = v ? { x: into * (left ? 1 : -1), y: 0 } : { x: 0, y: into * (top ? 1 : -1) };
    swing = swingFrom(P(hinge), P(other), m, dw, e.door === 'out');
  }

  // fixtures along the two outer walls: the "top" run (y = 0) and the "left" run (x = 0)
  const fixtures = [];
  const missing = [];
  const put = (type, rc, back, wl) => {
    const back2 = {
      top: top ? 'top' : 'bottom', bottom: top ? 'bottom' : 'top', left: left ? 'left' : 'right', right: left ? 'right' : 'left',
    }[back];
    const rect = R(rc);
    // flip: the mirror into this corner isn't a rotation, so a lopsided model (the shower) is mirrored too
    fixtures.push({
      type, rect, x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, rot: HEAD_ROT[back2], w: wl.w, l: wl.l, flip: left !== top,
    });
  };
  let topAt = 0;
  let leftAt = 0;
  let clear = null;
  if (e.id === 'walkin') {
    // rail along one outer wall, shelving tower along the other, then a bench and a mirror
    const shelves = e.storage === 'two' && il - RAIL_D >= 0.4;
    if (il >= RAIL_D + 0.3) put('rail', { x0: 0, y0: 0, x1: iw, y1: RAIL_D }, 'top', { w: iw, l: RAIL_D });
    else missing.push('rail');
    if (e.storage === 'two') {
      if (shelves && iw >= SHELF_D + 0.5) put('shelves', { x0: 0, y0: RAIL_D, x1: SHELF_D, y1: il }, 'left', { w: il - RAIL_D, l: SHELF_D });
      else missing.push('shelves');
    }
    const fx0 = fixtures.some((f) => f.type === 'shelves') ? SHELF_D : 0;
    const fr = { x0: fx0, y0: RAIL_D, x1: iw, y1: il };
    clear = R(fr);
    const fw = fr.x1 - fr.x0;
    const fh = fr.y1 - fr.y0;
    if (e.bench) {
      const bw = Math.min(0.9, fw - 0.5);
      if (bw >= 0.5 && fh >= 0.4 + STAND) {
        const cx = (fr.x0 + fr.x1) / 2;
        const cy = (fr.y0 + fr.y1) / 2;
        put('bench', { x0: cx - bw / 2, y0: cy - 0.2, x1: cx + bw / 2, y1: cy + 0.2 }, 'bottom', { w: bw, l: 0.4 });
      } else missing.push('bench');
    }
    if (e.mirror) {
      // on the partition without the door, facing into the closet
      if (e.doorSide === 'v' && fw >= 0.7) {
        const cx = (fr.x0 + fr.x1) / 2;
        put('mirror', { x0: cx - 0.3, y0: il - 0.03, x1: cx + 0.3, y1: il }, 'bottom', { w: 0.6, l: 0.03 });
      } else if (e.doorSide === 'h' && fh >= 0.7) {
        const cy = (fr.y0 + fr.y1) / 2;
        put('mirror', { x0: iw - 0.03, y0: cy - 0.3, x1: iw, y1: cy + 0.3 }, 'right', { w: 0.6, l: 0.03 });
      } else missing.push('mirror');
    }
  } else if (e.wet === 'shower') {
    const f = FIX.shower;
    if (iw >= f.w - 1e-6 && il >= f.l - 1e-6) {
      put('shower', { x0: 0, y0: 0, x1: f.w, y1: f.l }, 'top', f);
      topAt = f.w;
      leftAt = f.l;
    } else missing.push('shower');
  } else if (e.wet === 'bath') {
    const f = FIX.bath;
    if (iw >= f.w && il >= f.l + 0.3) {
      put('bath', { x0: 0, y0: 0, x1: f.w, y1: f.l }, 'top', f);
      topAt = f.w;
      leftAt = f.l;
    } else if (il >= f.w && iw >= f.l + 0.3) {
      put('bath', { x0: 0, y0: 0, x1: f.l, y1: f.w }, 'left', f);
      topAt = f.l;
      leftAt = f.w;
    } else missing.push('bath');
  }
  for (const type of e.id === 'walkin' ? [] : ['vanity', 'toilet']) {
    if (!e[type]) continue;
    const f = FIX[type];
    const topFree = iw - topAt + 1e-6;
    const leftFree = il - leftAt + 1e-6;
    const useTop = topFree >= f.run && (topFree >= leftFree || leftFree < f.run);
    if (useTop) {
      const x0 = topAt + (f.run - f.w) / 2;
      put(type, { x0, y0: 0, x1: x0 + f.w, y1: f.l }, 'top', f);
      topAt += f.run;
    } else if (leftFree >= f.run && iw >= f.l + 0.2) {
      const y0 = leftAt + (f.run - f.w) / 2;
      put(type, { x0: 0, y0, x1: f.l, y1: y0 + f.w }, 'left', f);
      leftAt += f.run;
    } else missing.push(type);
  }

  if (e.finish) for (const f of fixtures) f.finish = e.finish;
  return {
    rect: R({ x0: 0, y0: 0, x1: w, y1: l }),
    interior: R({ x0: 0, y0: 0, x1: iw, y1: il }),
    walls: wallsC.map(R).filter((r) => r.x1 - r.x0 > 1e-4 && r.y1 - r.y0 > 1e-4),
    gap: R(gapC),
    vertical: v, // door wall runs top to bottom on the plan
    swing,
    fixtures,
    missing,
    clear, // walk-in only: the floor left to stand in
  };
}
