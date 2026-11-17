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

// ---------- 3D models built from primitives ----------

let MATS = null;
function mats(THREE) {
  if (MATS) return MATS;
  const std = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
  MATS = {
    wood: std(0xa9805a, 0.6),
    woodDark: std(0x6f5139, 0.6),
    paint: std(0xe9e4dc, 0.7),
    fabric: std(0x8d8f99, 0.95),
    fabricLight: std(0x9fa1ab, 0.95),
    mattress: std(0xf6f4ef, 0.9),
    duvet: std(0x7f98b5, 0.95),
    pillow: std(0xffffff, 0.95),
    metal: std(0x3a3a3a, 0.35),
  };
  return MATS;
}

export function buildBed3D(THREE, RoundedBoxGeometry, bed, ceiling) {
  const M = mats(THREE);
  const m = mattressOf(bed);
  const f = FRAMES[bed.frame];
  const { w: FW, l: FL } = footprint(bed);
  const g = new THREE.Group();

  const box = (mat, w, h, d, x, y0, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y0 + h / 2, z);
    g.add(mesh);
    return mesh;
  };
  const rbox = (mat, w, h, d, r, x, y0, z) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2 - 0.001)), mat);
    mesh.position.set(x, y0 + h / 2, z);
    g.add(mesh);
    return mesh;
  };

  const headZ = -FL / 2; // head end, local -z
  const baseLen = FL - f.head; // length of base behind the headboard
  const baseZ = f.head / 2; // centre of that base
  let top; // height of the mattress support

  if (bed.frame === 'platform') {
    box(M.woodDark, FW - 0.16, 0.12, baseLen - 0.16, 0, 0, baseZ);
    box(M.wood, FW, 0.06, baseLen, 0, 0.12, baseZ);
    box(M.wood, FW, 0.62, f.head, 0, 0, headZ + f.head / 2);
    top = 0.18;
  } else if (bed.frame === 'panel') {
    const legH = 0.12;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(M.woodDark, 0.05, legH, 0.05, sx * (FW / 2 - 0.08), 0, baseZ + sz * (baseLen / 2 - 0.08));
    }
    rbox(M.fabric, FW, 0.16, baseLen, 0.02, 0, legH, baseZ);
    rbox(M.fabric, FW, 1.1, f.head, 0.02, 0, 0, headZ + f.head / 2);
    const n = Math.max(3, Math.round(FW / 0.3));
    const cw = FW / n;
    for (let i = 0; i < n; i++) {
      rbox(M.fabricLight, cw - 0.02, 0.66, 0.025, 0.01, -FW / 2 + cw * (i + 0.5), 0.38, headZ + f.head + 0.005);
    }
    top = 0.28;
  } else if (bed.frame === 'fourposter') {
    const p = f.head;
    const ph = Math.min(2.1, ceiling - 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(M.wood, p, ph, p, sx * (FW / 2 - p / 2), 0, sz * (FL / 2 - p / 2));
    }
    for (const sx of [-1, 1]) {
      box(M.wood, 0.04, 0.18, FL - 2 * p, sx * (FW / 2 - 0.02), 0.17, 0);
      box(M.wood, 0.04, 0.06, FL - 2 * p, sx * (FW / 2 - 0.02), ph - 0.08, 0);
    }
    for (const sz of [-1, 1]) {
      box(M.wood, FW - 2 * p, 0.18, 0.04, 0, 0.17, sz * (FL / 2 - 0.02));
      box(M.wood, FW - 2 * p, 0.06, 0.04, 0, ph - 0.08, sz * (FL / 2 - 0.02));
    }
    box(M.wood, FW - 2 * p, 0.55, 0.03, 0, 0.4, headZ + 0.035);
    box(M.woodDark, FW - 0.1, 0.03, FL - 0.1, 0, 0.3, 0);
    top = 0.33;
  } else {
    // storage drawers
    box(M.woodDark, FW - 0.06, 0.04, baseLen - 0.06, 0, 0, baseZ);
    box(M.paint, FW, 0.34, baseLen, 0, 0.04, baseZ);
    const usable = baseLen - 0.1;
    const dl = usable / 2;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const z = headZ + f.head + 0.05 + dl * (i + 0.5);
        box(M.paint, 0.015, 0.26, dl - 0.02, sx * (FW / 2 + 0.0075), 0.08, z);
        box(M.metal, 0.015, 0.02, 0.16, sx * (FW / 2 + 0.022), 0.28, z);
      }
    }
    rbox(M.fabric, FW, 0.95, f.head, 0.02, 0, 0, headZ + f.head / 2);
    top = 0.38;
  }

  // Mattress, duvet, pillows
  const mz0 = headZ + f.head;
  const mz1 = FL / 2 - f.foot;
  const mcz = (mz0 + mz1) / 2;
  const mh = 0.22;
  rbox(M.mattress, m.w, mh, m.l, 0.04, 0, top, mcz);
  const dLen = m.l * 0.68;
  const dz = mz1 - dLen / 2 + 0.01;
  rbox(M.duvet, m.w + 0.04, 0.05, dLen, 0.02, 0, top + mh - 0.01, dz);
  for (const sx of [-1, 1]) {
    box(M.duvet, 0.02, 0.17, dLen, sx * (m.w / 2 + 0.02), top + 0.07, dz);
  }
  box(M.duvet, m.w + 0.06, 0.17, 0.02, 0, top + 0.07, mz1 + 0.02);
  const count = m.w < 1.2 ? 1 : 2;
  const pw = Math.min(0.66, (m.w - 0.12) / count - 0.04);
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : (i === 0 ? -1 : 1) * (m.w / 4);
    rbox(M.pillow, pw, 0.12, 0.36, 0.05, x, top + mh - 0.01, mz0 + 0.25);
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
