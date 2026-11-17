// Desk setup: desk, chair, monitor(s), keyboard and PC as one group.
// Local coords match beds: x across, y from back (-) to front (+), metres.

export const DESK_LIMITS = {
  width: { min: 0.8, max: 2.4 },
  depth: { min: 0.5, max: 1.0 },
  height: { min: 0.6, max: 1.1 },
};
export const CHAIR_ZONE = 0.75;

export const FINISHES = { wood: 'Wood', white: 'White', black: 'Black' };
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

// what sits on the desk: the whole computer, a screen without a PC (say a laptop dock), or nothing
export const COMPUTER = { full: 'PC, monitor and keyboard', screen: 'Monitor and keyboard, no PC', none: 'Nothing, just the desk' };

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
    computer: 'full',
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

  const hasPc = s.computer !== 'screen' && s.computer !== 'none';
  const hasScreen = s.computer !== 'none';
  // free width for monitors and keyboard on the main top
  let workX1 = isL ? W / 2 - D : W / 2;
  if (!isL && hasPc && s.pc.place === 'desk') workX1 = pc.x0 - 0.03;
  const workX0 = -W / 2;
  const cx = (workX0 + workX1) / 2;

  const m = MONITORS[s.monitor.size];
  const n = s.monitor.count;
  const gap = 0.02;
  const monW = n * m.w + (n - 1) * gap;
  const monitors = [];
  for (let i = 0; i < (hasScreen ? n : 0); i++) {
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
    main, ret, solids: ret ? [main, ret] : [main], pc: hasPc ? pc : null, monitors,
    monitorRect: hasScreen ? monitorRect : null, keyboard: hasScreen ? keyboard : null, chair, chairZone,
    top, front, Lr, workX0, workX1, monTooWide: hasScreen && monW > workX1 - workX0 + 0.02,
  };
}

export function finish2D(s) {
  return FINISH_2D[s.desk.finish];
}
