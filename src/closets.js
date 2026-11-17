// Closets (wardrobes). Local coords match beds: x across, y from back (-) to front (+), metres.

export const CLOSET_STYLES = { hinged: 'Hinged doors', sliding: 'Sliding doors', open: 'Open rail and shelves' };
export const CLOSET_LIMITS = {
  width: { min: 0.4, max: 4.0 },
  depth: { min: 0.35, max: 0.8 },
  height: { min: 0.8, max: 3.0 },
};
export const CLOSET_FINISHES = { white: 'White', wood: 'Wood', black: 'Black', grey: 'Grey' };
const FINISH_2D = { white: '#f2f1ec', wood: '#c79c72', black: '#3a3b40', grey: '#9aa0a8' };
// room needed in front to open the doors or reach the rail
export const CLOSET_FRONT = 0.6;

export function defaultCloset(id) {
  return { id, x: 0, y: 0, rot: 0, closet: { style: 'hinged', width: 1.2, depth: 0.6, height: 2.1, finish: 'white' } };
}

export function closetFootprint(c) {
  return { w: c.closet.width, l: c.closet.depth };
}

/** How many door panels the front is split into. */
export function closetDoors(c) {
  const { style, width } = c.closet;
  if (style === 'open') return 0;
  if (style === 'sliding') return Math.max(2, Math.round(width / 0.9));
  return Math.max(1, Math.round(width / 0.5));
}

/** Clear zone in front, in local coords. Hinged doors need their own width to swing. */
export function closetFrontZone(c) {
  const { width: W, depth: D, style } = c.closet;
  const n = closetDoors(c);
  const need = style === 'hinged' ? Math.max(CLOSET_FRONT, W / n) : CLOSET_FRONT;
  return { x0: -W / 2, y0: D / 2, x1: W / 2, y1: D / 2 + need, need };
}

export function closetFinish2D(c) {
  return FINISH_2D[c.closet.finish];
}
