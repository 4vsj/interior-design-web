// Bed catalogue: real mattress sizes per region, and frame styles.
// All dimensions in metres. Mattress w = across, l = head to foot.

export const REGIONS = {
  AU: 'Australia',
  UK: 'UK',
  US: 'US',
};

export const SIZE_KEYS = ['single', 'double', 'queen', 'king'];

export const MATTRESS = {
  AU: {
    single: { label: 'Single', w: 0.92, l: 1.88 },
    double: { label: 'Double', w: 1.38, l: 1.88 },
    queen: { label: 'Queen', w: 1.53, l: 2.03 },
    king: { label: 'King', w: 1.83, l: 2.03 },
  },
  // The UK has no "queen"; its King and Super King fill those slots.
  UK: {
    single: { label: 'Single', w: 0.9, l: 1.9 },
    double: { label: 'Double', w: 1.35, l: 1.9 },
    queen: { label: 'Queen (UK King)', short: 'UK King', w: 1.5, l: 2.0 },
    king: { label: 'King (UK Super King)', short: 'Super King', w: 1.8, l: 2.0 },
  },
  US: {
    single: { label: 'Single (Twin)', short: 'Twin', w: 0.965, l: 1.905 },
    double: { label: 'Double (Full)', short: 'Full', w: 1.37, l: 1.905 },
    queen: { label: 'Queen', w: 1.524, l: 2.032 },
    king: { label: 'King', w: 1.93, l: 2.032 },
  },
};

// side/foot/head: how far the frame extends past the mattress.
export const FRAMES = {
  platform: { label: 'Platform', side: 0.05, foot: 0.05, head: 0.04 },
  panel: { label: 'Panel headboard', side: 0.04, foot: 0.04, head: 0.08 },
  fourposter: { label: 'Four-poster', side: 0.07, foot: 0.07, head: 0.07 },
  storage: { label: 'Storage drawers', side: 0.03, foot: 0.03, head: 0.08 },
};

export function mattressOf(bed) {
  return MATTRESS[bed.region][bed.size];
}

export function sizeShort(bed) {
  const m = mattressOf(bed);
  return m.short || m.label;
}

/** Footprint before rotation: w across, l head to foot. */
export function footprint(bed) {
  const m = mattressOf(bed);
  const f = FRAMES[bed.frame];
  return { w: m.w + 2 * f.side, l: m.l + f.head + f.foot };
}
