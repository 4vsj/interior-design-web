// Plan geometry. Room interior spans x 0..width, y 0..length (y grows down
// the screen, "top wall" is y = 0). Units are metres.
import { footprint, FRAMES, MATTRESS, sizeShort } from './beds.js';
import { deskFootprint, deskLayout } from './desks.js';
import { CLOSET_STYLES, closetFootprint, closetFrontZone } from './closets.js';
import { ensuiteLayout, FIXTURE_NAME } from './ensuite.js';

/** Beds, desk setups and closets share placement maths; a setup has `desk`, a closet `closet`. */
const fpOf = (item) => (item.desk ? deskFootprint(item) : item.closet ? closetFootprint(item) : footprint(item));

export const WALL_T = 0.1;
export const GRID = 0.1;
export const WALK = 0.6;
export const WALL_SNAP = 0.15;
const EPS = 1e-3;

export const WALLS = ['top', 'right', 'bottom', 'left'];
export const WALL_LABEL = { top: 'Top wall', right: 'Right wall', bottom: 'Bottom wall', left: 'Left wall' };

// rot (degrees, clockwise on screen) that puts the headboard on each wall
export const HEAD_ROT = { top: 0, right: 90, bottom: 180, left: 270 };
export const ROT_HEAD = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' };

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const snapGrid = (v, g = GRID) => Math.round(v / g) * g;

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const neg = (a) => ({ x: -a.x, y: -a.y });

export function wallInfo(room, wall) {
  const W = room.width;
  const L = room.length;
  switch (wall) {
    case 'top': return { start: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, len: W };
    case 'bottom': return { start: { x: 0, y: L }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, len: W };
    case 'left': return { start: { x: 0, y: 0 }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, len: L };
    case 'right': return { start: { x: W, y: 0 }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, len: L };
  }
  throw new Error(`bad wall ${wall}`);
}

export function openingEnds(room, op) {
  const w = wallInfo(room, op.wall);
  return { A: add(w.start, mul(w.u, op.pos)), B: add(w.start, mul(w.u, op.pos + op.width)), w };
}

/**
 * Nearest valid start position for `op` on `wall`, close to `desired`, that
 * stays on the wall and clear of every other opening. null if none fits.
 */
export function fitOpening(design, op, wall, desired) {
  const len = wallInfo(design.room, wall).len;
  if (op.width > len + EPS) return null;
  const taken = design.openings
    .filter((o) => o.id !== op.id && o.wall === wall)
    .map((o) => [o.pos, o.pos + o.width])
    .sort((a, b) => a[0] - b[0]);
  const free = [];
  let c = 0;
  for (const [a, b] of taken) {
    if (a > c) free.push([c, a]);
    c = Math.max(c, b);
  }
  if (c < len) free.push([c, len]);
  let best = null;
  let bestD = Infinity;
  for (const [a, b] of free) {
    if (b - a < op.width - EPS) continue;
    const p = clamp(desired, a, Math.max(a, b - op.width));
    const d = Math.abs(p - desired);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Door swing as a quarter circle: hinge, radius, start angle, signed sweep. */
export function doorSwing(room, door) {
  const { A, B, w } = openingEnds(room, door);
  const inward = door.swing.startsWith('in');
  const hingeLeft = door.swing.endsWith('left');
  // "left" as seen from inside the room, facing the wall
  const left = { x: -w.n.y, y: w.n.x };
  const bIsLeft = dot(w.u, left) > 0;
  const hinge = hingeLeft === bIsLeft ? B : A;
  const other = hinge === B ? A : B;
  const r = door.width;
  const s = mul(sub(other, hinge), 1 / r);
  const m = inward ? w.n : neg(w.n);
  const a1 = Math.atan2(s.y, s.x);
  const a2 = Math.atan2(m.y, m.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  const far = add(hinge, add(mul(s, r), mul(m, r)));
  const box = {
    x0: Math.min(hinge.x, far.x), y0: Math.min(hinge.y, far.y),
    x1: Math.max(hinge.x, far.x), y1: Math.max(hinge.y, far.y),
  };
  return { hinge, other, r, s, m, a1, d, inward, box };
}

// ---------- rectangles ----------

export function rectsOverlap(a, b) {
  return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
}

function rectInside(a, outer) {
  return a.x0 >= outer.x0 - EPS && a.y0 >= outer.y0 - EPS && a.x1 <= outer.x1 + EPS && a.y1 <= outer.y1 + EPS;
}

export function pointInRect(p, r) {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

function rectHitsSwing(rect, sw) {
  const b = sw.box;
  const r = {
    x0: Math.max(rect.x0, b.x0), y0: Math.max(rect.y0, b.y0),
    x1: Math.min(rect.x1, b.x1), y1: Math.min(rect.y1, b.y1),
  };
  if (r.x1 - r.x0 < EPS || r.y1 - r.y0 < EPS) return false;
  const cx = clamp(sw.hinge.x, r.x0, r.x1);
  const cy = clamp(sw.hinge.y, r.y0, r.y1);
  return Math.hypot(cx - sw.hinge.x, cy - sw.hinge.y) < sw.r - EPS;
}

// ---------- beds ----------

export function bedSize(bed) {
  const { w, l } = fpOf(bed);
  return bed.rot % 180 === 0 ? { fw: w, fh: l } : { fw: l, fh: w };
}

export function bedRect(bed) {
  const { fw, fh } = bedSize(bed);
  return { x0: bed.x - fw / 2, y0: bed.y - fh / 2, x1: bed.x + fw / 2, y1: bed.y + fh / 2 };
}

/** Local bed coords (head at -y) to a world-space rectangle. */
export function localRectToWorld(bed, lr) {
  const t = (bed.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  const pts = [[lr.x0, lr.y0], [lr.x1, lr.y1]].map(([x, y]) => ({
    x: bed.x + x * c - y * s,
    y: bed.y + x * s + y * c,
  }));
  return {
    x0: Math.min(pts[0].x, pts[1].x), y0: Math.min(pts[0].y, pts[1].y),
    x1: Math.max(pts[0].x, pts[1].x), y1: Math.max(pts[0].y, pts[1].y),
  };
}

/** Snap a bed centre: flush to nearby walls, otherwise edges on the 10 cm grid. */
export function snapBed(room, bed, cx, cy) {
  const { fw, fh } = bedSize(bed);
  const axis = (c, size, len) => {
    const raw = c - size / 2;
    let e;
    if (Math.abs(raw) < WALL_SNAP) e = 0;
    else if (Math.abs(raw + size - len) < WALL_SNAP) e = len - size;
    else e = snapGrid(raw);
    e = clamp(e, -size / 2, len - size / 2);
    return e + size / 2;
  };
  return { x: axis(cx, fw, room.width), y: axis(cy, fh, room.length) };
}

/** Keep the headboard edge where it was when the bed's size or frame changes. */
export function keepHeadEdge(oldBed, newBed) {
  const o = bedRect(oldBed);
  const n = bedRect(newBed);
  const head = ROT_HEAD[newBed.rot];
  const out = { x: newBed.x, y: newBed.y };
  if (head === 'top') out.y += o.y0 - n.y0;
  if (head === 'bottom') out.y += o.y1 - n.y1;
  if (head === 'left') out.x += o.x0 - n.x0;
  if (head === 'right') out.x += o.x1 - n.x1;
  return out;
}

/** Move a bed so its headboard is flush with `wall`. */
export function headAgainst(room, bed, wall) {
  const b = { ...bed, rot: HEAD_ROT[wall] };
  const { fw, fh } = bedSize(b);
  if (wall === 'top') b.y = fh / 2;
  if (wall === 'bottom') b.y = room.length - fh / 2;
  if (wall === 'left') b.x = fw / 2;
  if (wall === 'right') b.x = room.width - fw / 2;
  if (wall === 'top' || wall === 'bottom') b.x = clamp(b.x, fw / 2, Math.max(fw / 2, room.width - fw / 2));
  else b.y = clamp(b.y, fh / 2, Math.max(fh / 2, room.length - fh / 2));
  return { x: b.x, y: b.y, rot: b.rot };
}

/** Walkway zones beside and at the foot of the bed, in local coords. */
export function clearanceStrips(bed) {
  const { w, l } = footprint(bed);
  const hw = w / 2;
  const hl = l / 2;
  return [
    { side: 'side', rect: { x0: -hw - WALK, y0: -hl, x1: -hw, y1: hl } },
    { side: 'side', rect: { x0: hw, y0: -hl, x1: hw + WALK, y1: hl } },
    { side: 'foot', rect: { x0: -hw - WALK, y0: hl, x1: hw + WALK, y1: hl + WALK } },
  ];
}

// ---------- naming ----------

export function bedName(design, bed) {
  return `Bed ${design.beds.indexOf(bed) + 1}`;
}

export function deskName(design, s) {
  return `Desk setup ${design.desks.indexOf(s) + 1}`;
}

export function closetName(design, c) {
  return `Closet ${design.closets.indexOf(c) + 1}`;
}

export function closetDescription(c) {
  return `${CLOSET_STYLES[c.closet.style].split(' ')[0]} · ${Math.round(c.closet.width * 100)} cm wide`;
}

export function bedDescription(bed) {
  return `${sizeShort(bed)} · ${FRAMES[bed.frame].label}`;
}

export function openingName(design, op) {
  const same = design.openings.filter((o) => o.type === op.type);
  return `${op.type === 'door' ? 'Door' : 'Window'} ${same.indexOf(op) + 1}`;
}

/** World rects of everything a setup puts on the floor that can't overlap. */
export function deskSolids(s) {
  const L = deskLayout(s);
  return L.solids.map((r) => localRectToWorld(s, r));
}

// ---------- analysis ----------

const clipToRoom = (r, room) => ({
  x0: Math.max(r.x0, 0), y0: Math.max(r.y0, 0),
  x1: Math.min(r.x1, room.width), y1: Math.min(r.y1, room.length),
});
const nonEmpty = (r) => r.x1 - r.x0 > EPS && r.y1 - r.y0 > EPS;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Collisions (errors) and walkway shortfalls (tips) for beds and desk setups.
 * Returns { issues: [{level, text, id, kind}], items: {id: {error, strips}} }.
 * `beds` is the same map, kept for older callers.
 */
export function analyze(design) {
  const { room } = design;
  const roomRect = { x0: 0, y0: 0, x1: room.width, y1: room.length };
  const issues = [];
  const items = {};
  const desks = design.desks || [];
  const closets = design.closets || [];
  const ens = design.ensuite ? ensuiteLayout(room, design.ensuite) : null;
  // every solid footprint, tagged with its owner
  const owners = [
    ...design.beds.map((b) => ({ kind: 'bed', item: b, name: bedName(design, b), rects: [bedRect(b)] })),
    ...desks.map((s) => ({ kind: 'desk', item: s, name: deskName(design, s), rects: deskSolids(s) })),
    ...closets.map((c) => ({ kind: 'closet', item: c, name: closetName(design, c), rects: [bedRect(c)] })),
  ];
  if (ens) owners.push({ kind: 'ensuite', item: design.ensuite, name: 'the ensuite', rects: [ens.rect] });
  const swings = design.openings
    .filter((o) => o.type === 'door')
    .map((o) => ({ name: openingName(design, o), sw: doorSwing(room, o) }))
    .filter((s) => s.sw.inward);
  // an ensuite door that opens into the bedroom needs the same clear arc
  if (ens && ens.swing && ens.swing.inward) swings.push({ name: 'the ensuite door', sw: ens.swing, ensuite: true });
  for (const o of owners) items[o.item.id] = { error: false, strips: [] };
  const hitsOthers = (rect, self) => owners.some((o) => o !== self && o.rects.some((r) => rectsOverlap(rect, r)));

  owners.forEach((o, i) => {
    const st = items[o.item.id];
    const err = (text) => {
      st.error = true;
      issues.push({ level: 'error', id: o.item.id, kind: o.kind, text: cap(text) });
    };
    if (o.rects.some((r) => !rectInside(r, roomRect))) err(`${o.name} runs into a wall.`);
    for (let j = i + 1; j < owners.length; j++) {
      const p = owners[j];
      if (o.rects.some((r) => p.rects.some((q) => rectsOverlap(r, q)))) {
        items[p.item.id].error = true;
        err(`${o.name} overlaps ${p.name}.`);
      }
    }
    for (const sw of swings) {
      if (sw.ensuite && o.kind === 'ensuite') continue;
      if (o.rects.some((r) => rectHitsSwing(r, sw.sw))) err(`${o.name} blocks ${sw.name} from opening.`);
    }

    if (o.kind === 'bed') {
      let shortSides = 0;
      let shortFoot = false;
      for (const strip of clearanceStrips(o.item)) {
        const wr = localRectToWorld(o.item, strip.rect);
        const ok = rectInside(wr, roomRect) && !hitsOthers(wr, o);
        const draw = clipToRoom(wr, room);
        if (nonEmpty(draw)) st.strips.push({ rect: draw, ok });
        if (!ok && strip.side === 'side') shortSides++;
        if (!ok && strip.side === 'foot') shortFoot = true;
      }
      const where = [];
      if (shortSides === 2) where.push('both sides');
      if (shortSides === 1) where.push('one side');
      if (shortFoot) where.push('the foot');
      if (where.length) {
        issues.push({ level: 'tip', id: o.item.id, kind: o.kind, text: `${o.name} has less than ${design.units === 'ft' ? '2 ft' : '60 cm'} of walkway at ${where.join(' and ')}.` });
      }
    } else if (o.kind === 'closet') {
      const z = closetFrontZone(o.item);
      const wr = localRectToWorld(o.item, z);
      const ok = rectInside(wr, roomRect) && !hitsOthers(wr, o);
      const draw = clipToRoom(wr, room);
      if (nonEmpty(draw)) st.strips.push({ rect: draw, ok });
      if (!ok) {
        const cm = design.units === 'ft' ? `${Math.round(z.need / 0.3048 * 10) / 10} ft` : `${Math.round(z.need * 100)} cm`;
        const what = o.item.closet.style === 'open' ? 'to reach the rail' : 'to open the doors';
        issues.push({ level: 'tip', id: o.item.id, kind: o.kind, text: `${o.name} has less than ${cm} in front ${what}.` });
      }
    } else if (o.kind === 'ensuite') {
      for (const t of ens.missing) {
        issues.push({ level: 'tip', id: o.item.id, kind: o.kind, text: `The ensuite is too small for the ${FIXTURE_NAME[t]}. Make it bigger or remove something.` });
      }
      if (ens.swing && !ens.swing.inward) {
        const hit = ens.fixtures.find((f) => rectHitsSwing(f.rect, ens.swing));
        if (hit) issues.push({ level: 'tip', id: o.item.id, kind: o.kind, text: `The ensuite door hits the ${FIXTURE_NAME[hit.type]} when it opens. Move the door or make it sliding.` });
      }
    } else {
      const L = deskLayout(o.item);
      const wr = localRectToWorld(o.item, L.chairZone);
      const ok = rectInside(wr, roomRect) && !hitsOthers(wr, o);
      const draw = clipToRoom(wr, room);
      if (nonEmpty(draw)) st.strips.push({ rect: draw, ok });
      if (!ok) {
        issues.push({ level: 'tip', id: o.item.id, kind: o.kind, text: `${o.name} has less than ${design.units === 'ft' ? '2.5 ft' : '75 cm'} behind the desk for the chair.` });
      }
      if (L.monTooWide) {
        issues.push({ level: 'tip', id: o.item.id, kind: o.kind, text: `${o.name}: the monitors are wider than the free desk space.` });
      }
    }
  });
  return { issues, items, beds: items };
}

export { MATTRESS };
