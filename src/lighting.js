// Light colours and where LED strips run. Plan coords, metres.
import { deskLayout, MONITORS } from './desks.js';
import { bedRect, localRectToWorld } from './geometry.js';

export const TEMP_COLOR = { warm: '#ffb46b', neutral: '#ffe4c4', cool: '#dbe7ff' };

const toWorld = (item, x, y) => {
  const t = (item.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  return { x: item.x + x * c - y * s, y: item.y + x * s + y * c };
};
const rotDir = (item, x, y) => {
  const p = toWorld({ ...item, x: 0, y: 0 }, x, y);
  return p;
};

/**
 * Segments for a strip: [{a, b, h, face}] where a/b are plan points, h is the
 * height in metres and face is the plan direction the light points
 * ({x, y}), or null for straight down.
 */
export function stripSegments(d, strip) {
  const H = d.room.height;
  if (strip.attach === 'ceiling') {
    const i = 0.04;
    const W = d.room.width;
    const L = d.room.length;
    const h = H - 0.03;
    return [
      { a: { x: i, y: i }, b: { x: W - i, y: i }, h, face: { x: 0, y: -1 } },
      { a: { x: W - i, y: i }, b: { x: W - i, y: L - i }, h, face: { x: 1, y: 0 } },
      { a: { x: W - i, y: L - i }, b: { x: i, y: L - i }, h, face: { x: 0, y: 1 } },
      { a: { x: i, y: L - i }, b: { x: i, y: i }, h, face: { x: -1, y: 0 } },
    ];
  }
  if (strip.attach === 'bed') {
    const bed = d.beds.find((b) => b.id === strip.target);
    if (!bed) return [];
    const r = bedRect(bed);
    const i = 0.04;
    const h = 0.06;
    return [
      { a: { x: r.x0 + i, y: r.y0 + i }, b: { x: r.x1 - i, y: r.y0 + i }, h, face: null },
      { a: { x: r.x1 - i, y: r.y0 + i }, b: { x: r.x1 - i, y: r.y1 - i }, h, face: null },
      { a: { x: r.x1 - i, y: r.y1 - i }, b: { x: r.x0 + i, y: r.y1 - i }, h, face: null },
      { a: { x: r.x0 + i, y: r.y1 - i }, b: { x: r.x0 + i, y: r.y0 + i }, h, face: null },
    ];
  }
  const s = d.desks.find((k) => k.id === strip.target);
  if (!s) return [];
  const L = deskLayout(s);
  if (strip.attach === 'desk') {
    const m = L.main;
    const y = L.front - 0.04;
    return [{ a: toWorld(s, m.x0 + 0.05, y), b: toWorld(s, m.x1 - 0.05, y), h: s.desk.height - 0.035, face: null }];
  }
  // back of the monitor(s): light points at the wall behind the desk
  const mon = MONITORS[s.monitor.size];
  const r = L.monitorRect;
  if (!r) return []; // no monitor on this desk
  const y = L.top + 0.1;
  return [{
    a: toWorld(s, r.x0 + 0.05, y), b: toWorld(s, r.x1 - 0.05, y),
    h: s.desk.height + 0.1 + mon.h / 2, face: rotDir(s, 0, -1),
  }];
}

export { localRectToWorld };
