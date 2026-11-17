// Design model, undo/redo history and localStorage persistence.
import { FRAMES, MATTRESS, SIZE_KEYS } from './beds.js';
import {
  CASES, CHAIRS, COMPUTER, COOLERS, DESK_LIMITS, defaultSetup, FINISHES, GPUS, KEYBOARDS, MONITORS,
} from './desks.js';
import { CLOSET_FINISHES, CLOSET_LIMITS, CLOSET_STYLES, defaultCloset } from './closets.js';
import {
  clampEnsuite, CORNERS, defaultEnsuite, defaultWalkin, ENS_DOORS, STORAGE, WET,
} from './ensuite.js';
import {
  analyze, clamp, fitOpening, headAgainst, HEAD_ROT, snapBed, WALLS, wallInfo,
} from './geometry.js';

const STORAGE_KEY = 'bedroom-planner:v1';
const HISTORY_MAX = 100;

export const LIMITS = {
  room: { min: 1.5, max: 15 },
  height: { min: 2.0, max: 4.0 },
  openingWidth: { min: 0.3 },
};

export const SWINGS = {
  'in-left': 'Into room, hinge on left',
  'in-right': 'Into room, hinge on right',
  'out-left': 'Out of room, hinge on left',
  'out-right': 'Out of room, hinge on right',
};

export const uid = (p) => p + Math.random().toString(36).slice(2, 9);

function localeDefaults() {
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-AU';
  if (/^en-US/i.test(lang)) return { units: 'ft', region: 'US' };
  if (/^en-GB|^en-IE/i.test(lang)) return { units: 'm', region: 'UK' };
  return { units: 'm', region: 'AU' };
}

export function defaultDesign() {
  const { units, region } = localeDefaults();
  return {
    version: 1,
    units,
    region,
    room: { width: 4.0, length: 3.5, height: 2.4 },
    openings: [],
    beds: [],
    desks: [],
    closets: [],
    ensuite: null,
    walkin: null,
    lighting: { mode: 'day', lights: [], strips: [] },
  };
}

export function normalizeCloset(raw, id, room) {
  const c = defaultCloset(id);
  const k = raw.closet || {};
  c.closet.style = pick(k.style, CLOSET_STYLES, c.closet.style);
  c.closet.finish = pick(k.finish, CLOSET_FINISHES, c.closet.finish);
  for (const f of ['width', 'depth', 'height']) c.closet[f] = clamp(num(k[f], c.closet[f]), CLOSET_LIMITS[f].min, CLOSET_LIMITS[f].max);
  c.closet.height = Math.min(c.closet.height, room.height);
  c.rot = ROTS.includes(raw.rot) ? raw.rot : 0;
  c.x = clamp(num(raw.x, room.width / 2), 0, room.width);
  c.y = clamp(num(raw.y, room.length / 2), 0, room.length);
  return c;
}

export function normalizeEnsuite(raw, room) {
  if (!raw || typeof raw !== 'object') return null;
  const e = defaultEnsuite(room);
  e.corner = pick(raw.corner, CORNERS, e.corner);
  e.offX = num(raw.offX, 0);
  e.offY = num(raw.offY, 0);
  e.width = num(raw.width, e.width);
  e.length = num(raw.length, e.length);
  e.doorSide = raw.doorSide === 'h' ? 'h' : 'v';
  e.doorWidth = num(raw.doorWidth, e.doorWidth);
  e.doorAt = num(raw.doorAt, e.doorAt);
  e.door = pick(raw.door, ENS_DOORS, e.door);
  e.wet = pick(raw.wet, WET, e.wet);
  e.toilet = raw.toilet !== false;
  e.vanity = raw.vanity !== false;
  return clampEnsuite(room, e);
}

export function normalizeWalkin(raw, room) {
  if (!raw || typeof raw !== 'object') return null;
  const e = defaultWalkin(room);
  e.corner = pick(raw.corner, CORNERS, e.corner);
  e.offX = num(raw.offX, 0);
  e.offY = num(raw.offY, 0);
  e.width = num(raw.width, e.width);
  e.length = num(raw.length, e.length);
  e.doorSide = raw.doorSide === 'h' ? 'h' : 'v';
  e.doorWidth = num(raw.doorWidth, e.doorWidth);
  e.doorAt = num(raw.doorAt, e.doorAt);
  e.door = pick(raw.door, ENS_DOORS, e.door);
  e.storage = pick(raw.storage, STORAGE, e.storage);
  e.finish = pick(raw.finish, CLOSET_FINISHES, e.finish);
  e.mirror = raw.mirror !== false;
  e.bench = raw.bench !== false;
  return clampEnsuite(room, e);
}

export const LIGHT_TYPES = { flush: 'Flush mount', pendant: 'Hanging pendant' };
export const TEMPS = { warm: 'Warm (2700 K)', neutral: 'Neutral (4000 K)', cool: 'Cool (6500 K)' };
export const EFFECTS = { static: 'Static', cycle: 'Slow colour cycle' };
export const ATTACH = { desk: 'Desk underside', monitor: 'Back of monitor', bed: 'Bed frame', ceiling: 'Ceiling edge' };

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const pick = (v, table, fallback) => (Object.prototype.hasOwnProperty.call(table, v) ? v : fallback);
const ROTS = [0, 90, 180, 270];
// ids are kept on import so LED strips stay attached to their bed or desk
const keepId = (v, prefix, seen) => {
  const id = typeof v === 'string' && /^[a-z0-9]{2,20}$/i.test(v) && !seen.has(v) ? v : uid(prefix);
  seen.add(id);
  return id;
};

export function normalizeSetup(raw, id, room) {
  const s = defaultSetup(id);
  const dk = raw.desk || {};
  s.desk.shape = dk.shape === 'l' ? 'l' : 'straight';
  for (const k of ['width', 'depth', 'height']) s.desk[k] = clamp(num(dk[k], s.desk[k]), DESK_LIMITS[k].min, DESK_LIMITS[k].max);
  s.desk.finish = pick(dk.finish, FINISHES, s.desk.finish);
  const ch = raw.chair || {};
  s.chair.style = pick(ch.style, CHAIRS, s.chair.style);
  s.chair.color = hex(ch.color, s.chair.color);
  const mo = raw.monitor || {};
  s.monitor.size = pick(String(mo.size), MONITORS, s.monitor.size);
  s.monitor.count = mo.count === 2 ? 2 : 1;
  const kb = raw.keyboard || {};
  s.keyboard.layout = pick(String(kb.layout), KEYBOARDS, s.keyboard.layout);
  s.keyboard.rgb = kb.rgb === true;
  const pc = raw.pc || {};
  s.pc.place = pc.place === 'floor' ? 'floor' : 'desk';
  s.pc.style = pick(pc.style, CASES, s.pc.style);
  s.pc.color = hex(pc.color, s.pc.color);
  s.pc.gpu = pick(pc.gpu, GPUS, s.pc.gpu);
  s.pc.cooler = pick(pc.cooler, COOLERS, s.pc.cooler);
  s.pc.rgb = pc.rgb !== false;
  s.pc.rgbColor = hex(pc.rgbColor, s.pc.rgbColor);
  s.computer = pick(raw.computer, COMPUTER, 'full');
  s.rot = ROTS.includes(raw.rot) ? raw.rot : 0;
  s.x = clamp(num(raw.x, room.width / 2), 0, room.width);
  s.y = clamp(num(raw.y, room.length / 2), 0, room.length);
  return s;
}

/** Validate untrusted input (localStorage or an imported file) into a design. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a bedroom plan file.');
  const d = defaultDesign();
  const seen = new Set();
  if (raw.units === 'm' || raw.units === 'ft') d.units = raw.units;
  if (MATTRESS[raw.region]) d.region = raw.region;
  const r = raw.room || {};
  d.room.width = clamp(num(r.width, d.room.width), LIMITS.room.min, LIMITS.room.max);
  d.room.length = clamp(num(r.length, d.room.length), LIMITS.room.min, LIMITS.room.max);
  d.room.height = clamp(num(r.height, d.room.height), LIMITS.height.min, LIMITS.height.max);

  for (const o of Array.isArray(raw.openings) ? raw.openings : []) {
    if (!o || (o.type !== 'door' && o.type !== 'window') || !WALLS.includes(o.wall)) continue;
    const op = {
      id: keepId(o.id, o.type === 'door' ? 'd' : 'w', seen),
      type: o.type,
      wall: o.wall,
      pos: Math.max(0, num(o.pos, 0)),
      width: Math.max(LIMITS.openingWidth.min, num(o.width, 0.9)),
      height: num(o.height, o.type === 'door' ? 2.04 : 1.2),
      sill: o.type === 'door' ? 0 : Math.max(0, num(o.sill, 0.9)),
    };
    if (op.type === 'door') op.swing = SWINGS[o.swing] ? o.swing : 'in-left';
    clampOpeningHeights(op, d.room.height);
    const pos = fitOpening(d, op, op.wall, op.pos);
    if (pos === null) continue;
    op.pos = pos;
    d.openings.push(op);
  }

  for (const b of Array.isArray(raw.beds) ? raw.beds : []) {
    if (!b || !MATTRESS[b.region] || !SIZE_KEYS.includes(b.size) || !FRAMES[b.frame]) continue;
    const rot = [0, 90, 180, 270].includes(b.rot) ? b.rot : 0;
    d.beds.push({
      id: keepId(b.id, 'b', seen),
      region: b.region,
      size: b.size,
      frame: b.frame,
      rot,
      x: clamp(num(b.x, d.room.width / 2), 0, d.room.width),
      y: clamp(num(b.y, d.room.length / 2), 0, d.room.length),
    });
  }

  for (const k of Array.isArray(raw.desks) ? raw.desks : []) {
    if (!k || typeof k !== 'object') continue;
    d.desks.push(normalizeSetup(k, keepId(k.id, 'k', seen), d.room));
  }

  for (const c of Array.isArray(raw.closets) ? raw.closets : []) {
    if (!c || typeof c !== 'object') continue;
    d.closets.push(normalizeCloset(c, keepId(c.id, 'c', seen), d.room));
  }
  d.ensuite = normalizeEnsuite(raw.ensuite, d.room);
  d.walkin = normalizeWalkin(raw.walkin, d.room);

  const lt = raw.lighting || {};
  d.lighting.mode = lt.mode === 'night' ? 'night' : 'day';
  for (const l of Array.isArray(lt.lights) ? lt.lights : []) {
    if (!l || typeof l !== 'object') continue;
    d.lighting.lights.push({
      id: keepId(l.id, 'l', seen),
      type: pick(l.type, LIGHT_TYPES, 'flush'),
      x: clamp(num(l.x, d.room.width / 2), 0, d.room.width),
      y: clamp(num(l.y, d.room.length / 2), 0, d.room.length),
      cord: clamp(num(l.cord, 0.6), 0.1, maxCord(d.room)),
      temp: pick(l.temp, TEMPS, 'neutral'),
      brightness: clamp(Math.round(num(l.brightness, 80)), 0, 100),
    });
  }
  for (const t of Array.isArray(lt.strips) ? lt.strips : []) {
    if (!t || typeof t !== 'object') continue;
    const strip = {
      id: keepId(t.id, 's', seen),
      attach: pick(t.attach, ATTACH, 'ceiling'),
      target: typeof t.target === 'string' ? t.target : null,
      on: t.on !== false,
      color: hex(t.color, '#8b5cf6'),
      effect: pick(t.effect, EFFECTS, 'static'),
    };
    if (stripTargetValid(d, strip)) d.lighting.strips.push(strip);
  }
  return d;
}

export const maxCord = (room) => Math.max(0.1, Math.min(1.5, room.height - 1.9));

export function stripTargetValid(d, strip) {
  if (strip.attach === 'ceiling') {
    strip.target = null;
    return true;
  }
  const list = strip.attach === 'bed' ? d.beds : d.desks;
  return list.some((x) => x.id === strip.target);
}

/** The objects a strip can hang on, as [value, label] for one flat dropdown. */
export function stripTargets(d) {
  const out = [['ceiling:', 'Ceiling edge']];
  d.beds.forEach((b, i) => out.push([`bed:${b.id}`, `Bed ${i + 1} frame`]));
  d.desks.forEach((k, i) => {
    out.push([`desk:${k.id}`, `Desk setup ${i + 1}, desk underside`]);
    if (k.computer !== 'none') out.push([`monitor:${k.id}`, `Desk setup ${i + 1}, back of monitor`]);
  });
  return out;
}

export function clampOpeningHeights(op, ceiling) {
  if (op.type === 'door') {
    op.sill = 0;
    op.height = clamp(op.height, 1.5, ceiling);
  } else {
    op.sill = clamp(op.sill, 0, ceiling - 0.3);
    op.height = clamp(op.height, 0.3, ceiling - op.sill);
  }
}

export function exportable(design) {
  return {
    app: 'bedroom-planner',
    version: 1,
    units: design.units,
    region: design.region,
    room: design.room,
    openings: design.openings,
    beds: design.beds,
    desks: design.desks,
    closets: design.closets,
    ensuite: design.ensuite,
    walkin: design.walkin,
    lighting: design.lighting,
  };
}

function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return normalize(JSON.parse(s));
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return defaultDesign();
}

function save(design) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
    return true;
  } catch {
    return false;
  }
}

// ---------- store ----------

export const store = {
  design: load(),
  selected: null, // { kind: 'bed' | 'opening' | 'desk' | 'closet' | 'ensuite' | 'light' | 'strip', id, part? }
  view: '2d',
  viewOnly: false, // look around without being able to select or move anything
  saved: true,
  past: [],
  future: [],
  analysis: null,
  subs: new Set(),
  snap: null,
  flashMsg: null,

  subscribe(fn) {
    this.subs.add(fn);
  },
  emit() {
    this.analysis = analyze(this.design);
    for (const fn of this.subs) fn(this);
  },
  persist() {
    this.saved = save(this.design);
  },
  /** Apply fn to a copy of the design as one undoable step. fn may return false to cancel. */
  commit(fn) {
    const before = JSON.stringify(this.design);
    const draft = JSON.parse(before);
    if (fn(draft) === false) {
      this.emit();
      return false;
    }
    if (JSON.stringify(draft) === before) {
      this.emit();
      return true;
    }
    this.past.push(before);
    if (this.past.length > HISTORY_MAX) this.past.shift();
    this.future = [];
    this.design = draft;
    this.fixSelection();
    this.persist();
    this.emit();
    return true;
  },
  /** Live edits during a drag: one undo step from begin() to end(). */
  begin() {
    this.snap = JSON.stringify(this.design);
  },
  preview(fn) {
    fn(this.design);
    this.emit();
  },
  end() {
    if (this.snap === null) return;
    if (JSON.stringify(this.design) !== this.snap) {
      this.past.push(this.snap);
      if (this.past.length > HISTORY_MAX) this.past.shift();
      this.future = [];
      this.persist();
    }
    this.snap = null;
    this.emit();
  },
  undo() {
    if (!this.past.length) return;
    this.future.push(JSON.stringify(this.design));
    this.design = JSON.parse(this.past.pop());
    this.fixSelection();
    this.persist();
    this.emit();
  },
  redo() {
    if (!this.future.length) return;
    this.past.push(JSON.stringify(this.design));
    this.design = JSON.parse(this.future.pop());
    this.fixSelection();
    this.persist();
    this.emit();
  },
  select(sel) {
    this.selected = sel;
    this.emit();
  },
  fixSelection() {
    const s = this.selected;
    if (!s) return;
    if (!listFor(this.design, s.kind).some((x) => x.id === s.id)) this.selected = null;
  },
  flash(msg) {
    this.flashMsg = msg;
    for (const fn of this.subs) fn(this, { flash: msg });
  },
  selectedItem(design = this.design) {
    const s = this.selected;
    if (!s) return null;
    return listFor(design, s.kind).find((x) => x.id === s.id) || null;
  },
};

export function listFor(d, kind) {
  if (kind === 'bed') return d.beds;
  if (kind === 'opening') return d.openings;
  if (kind === 'desk') return d.desks;
  if (kind === 'closet') return d.closets;
  if (kind === 'ensuite') return d.ensuite ? [d.ensuite] : [];
  if (kind === 'walkin') return d.walkin ? [d.walkin] : [];
  if (kind === 'light') return d.lighting.lights;
  if (kind === 'strip') return d.lighting.strips;
  return [];
}

store.analysis = analyze(store.design);

// ---------- actions ----------

const NO_SPACE = 'There is no free wall space left for that. Move or narrow another door or window first.';

export function addOpening(type) {
  const id = uid(type === 'door' ? 'd' : 'w');
  const ok = store.commit((d) => {
    const op = type === 'door'
      ? { id, type, wall: 'bottom', pos: 0, width: 0.82, height: 2.04, sill: 0, swing: 'in-left' }
      : { id, type, wall: 'top', pos: 0, width: 1.2, height: 1.2, sill: 0.9 };
    clampOpeningHeights(op, d.room.height);
    const order = type === 'door' ? ['bottom', 'left', 'right', 'top'] : ['top', 'right', 'left', 'bottom'];
    for (const wall of order) {
      const len = wallInfo(d.room, wall).len;
      const desired = type === 'door' ? Math.min(0.15, len - op.width) : (len - op.width) / 2;
      const pos = fitOpening(d, op, wall, desired);
      if (pos !== null) {
        op.wall = wall;
        op.pos = pos;
        d.openings.push(op);
        return true;
      }
    }
    return false;
  });
  if (ok) store.select({ kind: 'opening', id });
  else store.flash(NO_SPACE);
}

/**
 * Try each wall with the headboard (or desk back) against it. Prefer a spot with
 * no clashes and clear walkways, then one with no clashes, then the first wall.
 */
function placeNew(d, item, listName = 'beds') {
  const order = ['top', 'left', 'right', 'bottom'];
  let first = null;
  let clashFree = null;
  for (const wall of order) {
    const len = wall === 'top' || wall === 'bottom' ? d.room.width : d.room.length;
    // the middle of the wall first, then further out in 10 cm steps either side
    const spots = [len / 2];
    for (let k = 0.1; k < len / 2; k += 0.1) spots.push(len / 2 - k, len / 2 + k);
    for (const along of spots) {
      const cand = { ...item, ...headAgainst(d.room, { ...item, x: along, y: along }, wall) };
      Object.assign(cand, snapBed(d.room, cand, cand.x, cand.y));
      if (!first) first = cand;
      const st = analyze({ ...d, [listName]: [...d[listName], cand] }).items[cand.id];
      if (st.error) continue;
      if (st.strips.every((x) => x.ok)) return cand;
      if (!clashFree) clashFree = cand;
    }
  }
  return clashFree || first;
}

export function addBed() {
  const id = uid('b');
  store.commit((d) => {
    const prev = d.beds[d.beds.length - 1];
    const bed = { id, region: d.region, size: prev ? prev.size : 'queen', frame: prev ? prev.frame : 'platform', rot: 0, x: 0, y: 0 };
    d.beds.push(placeNew(d, bed));
  });
  store.select({ kind: 'bed', id });
}

export function addDesk() {
  const id = uid('k');
  store.commit((d) => {
    d.desks.push(placeNew(d, defaultSetup(id), 'desks'));
  });
  store.select({ kind: 'desk', id, part: 'setup' });
}

export function addCloset() {
  const id = uid('c');
  store.commit((d) => {
    const prev = d.closets[d.closets.length - 1];
    const c = defaultCloset(id);
    if (prev) Object.assign(c.closet, prev.closet);
    c.closet.height = Math.min(c.closet.height, d.room.height);
    d.closets.push(placeNew(d, c, 'closets'));
  });
  store.select({ kind: 'closet', id });
}

/** Add the ensuite or the walk-in closet in the corner that clashes with the least. */
function addZone(kind, make) {
  store.commit((d) => {
    if (d[kind]) return false;
    let best = null;
    for (const corner of Object.keys(CORNERS)) {
      const e = make(d.room);
      e.corner = corner;
      const a = analyze({ ...d, [kind]: e });
      const n = a.issues.filter((i) => i.level === 'error').length * 10 + a.issues.length;
      if (!best || n < best.n) best = { e, n };
    }
    d[kind] = best.e;
  });
  store.select({ kind, id: kind });
}

export const addEnsuite = () => addZone('ensuite', defaultEnsuite);
export const addWalkin = () => addZone('walkin', defaultWalkin);

export function addLight() {
  const id = uid('l');
  store.commit((d) => {
    d.lighting.lights.push({
      id, type: 'flush', x: d.room.width / 2, y: d.room.length / 2,
      cord: Math.min(0.6, maxCord(d.room)), temp: 'neutral', brightness: 80,
    });
  });
  store.select({ kind: 'light', id });
}

export function addStrip() {
  const id = uid('s');
  store.commit((d) => {
    const desk = d.desks[d.desks.length - 1];
    const bed = d.beds[d.beds.length - 1];
    const strip = { id, attach: 'ceiling', target: null, on: true, color: '#8b5cf6', effect: 'static' };
    if (desk) Object.assign(strip, { attach: 'desk', target: desk.id });
    else if (bed) Object.assign(strip, { attach: 'bed', target: bed.id });
    d.lighting.strips.push(strip);
  });
  store.select({ kind: 'strip', id });
}

export function setMode(mode) {
  store.commit((d) => { d.lighting.mode = mode; });
}

export function deleteSelected() {
  const s = store.selected;
  if (!s) return;
  store.commit((d) => {
    if (s.kind === 'bed') d.beds = d.beds.filter((b) => b.id !== s.id);
    else if (s.kind === 'opening') d.openings = d.openings.filter((o) => o.id !== s.id);
    else if (s.kind === 'desk') d.desks = d.desks.filter((k) => k.id !== s.id);
    else if (s.kind === 'closet') d.closets = d.closets.filter((c) => c.id !== s.id);
    else if (s.kind === 'ensuite') d.ensuite = null;
    else if (s.kind === 'walkin') d.walkin = null;
    else if (s.kind === 'light') d.lighting.lights = d.lighting.lights.filter((l) => l.id !== s.id);
    else if (s.kind === 'strip') d.lighting.strips = d.lighting.strips.filter((t) => t.id !== s.id);
    // strips go with the bed or desk they were stuck to
    d.lighting.strips = d.lighting.strips.filter((t) => stripTargetValid(d, t));
  });
}

export function duplicateSelected() {
  const s = store.selected;
  if (!s) return;
  if (s.kind === 'ensuite' || s.kind === 'walkin') return;
  if (s.kind === 'bed' || s.kind === 'desk' || s.kind === 'closet' || s.kind === 'light') {
    const id = uid({ bed: 'b', desk: 'k', closet: 'c', light: 'l' }[s.kind]);
    store.commit((d) => {
      const list = listFor(d, s.kind);
      const src = list.find((b) => b.id === s.id);
      if (!src) return false;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = id;
      if (s.kind === 'light') {
        copy.x = clamp(src.x + 0.5, 0, d.room.width);
        copy.y = clamp(src.y + 0.5, 0, d.room.length);
      } else Object.assign(copy, snapBed(d.room, copy, src.x + 0.3, src.y + 0.3));
      list.push(copy);
    });
    store.select({ kind: s.kind, id, part: s.kind === 'desk' ? 'setup' : undefined });
  } else if (s.kind === 'strip') {
    const id = uid('s');
    store.commit((d) => {
      const src = d.lighting.strips.find((t) => t.id === s.id);
      if (!src) return false;
      d.lighting.strips.push({ ...src, id });
    });
    store.select({ kind: 'strip', id });
  } else {
    const id = uid('o');
    const ok = store.commit((d) => {
      const src = d.openings.find((o) => o.id === s.id);
      if (!src) return false;
      const copy = { ...src, id };
      for (const wall of [src.wall, ...WALLS.filter((w) => w !== src.wall)]) {
        const desired = wall === src.wall ? src.pos + src.width + 0.2 : 0;
        const pos = fitOpening(d, copy, wall, desired);
        if (pos !== null) {
          copy.wall = wall;
          copy.pos = pos;
          d.openings.push(copy);
          return true;
        }
      }
      return false;
    });
    if (ok) store.select({ kind: 'opening', id });
    else store.flash(NO_SPACE);
  }
}

// things that sit on the floor and can be dragged, nudged and rotated
export const MOVABLE = ['bed', 'desk', 'closet'];

export function rotateSelected() {
  const s = store.selected;
  if (!s || !MOVABLE.includes(s.kind)) return;
  store.commit((d) => {
    const b = listFor(d, s.kind).find((x) => x.id === s.id);
    b.rot = (b.rot + 90) % 360;
    Object.assign(b, snapBed(d.room, b, b.x, b.y));
  });
}

export function nudgeSelected(dx, dy) {
  const s = store.selected;
  if (!s || s.kind === 'strip' || s.kind === 'ensuite' || s.kind === 'walkin') return;
  store.commit((d) => {
    const item = listFor(d, s.kind).find((x) => x.id === s.id);
    if (MOVABLE.includes(s.kind)) {
      const p = snapBed(d.room, item, item.x + dx, item.y + dy);
      // snapping can pull a 10 cm nudge back onto a wall; step past it
      if (Math.abs(p.x - item.x) < 1e-6 && Math.abs(p.y - item.y) < 1e-6) {
        item.x = clamp(item.x + dx, 0, d.room.width);
        item.y = clamp(item.y + dy, 0, d.room.length);
      } else Object.assign(item, p);
    } else if (s.kind === 'light') {
      item.x = clamp(item.x + dx, 0, d.room.width);
      item.y = clamp(item.y + dy, 0, d.room.length);
    } else {
      const w = wallInfo(d.room, item.wall);
      const step = w.u.x ? dx : dy;
      if (!step) return false;
      const pos = fitOpening(d, item, item.wall, item.pos + step);
      if (pos === null) return false;
      item.pos = pos;
    }
  });
}

export function newDesign() {
  store.commit((d) => {
    const fresh = defaultDesign();
    fresh.units = d.units;
    fresh.region = d.region;
    Object.keys(d).forEach((k) => delete d[k]);
    Object.assign(d, fresh);
  });
  store.select(null);
}

export function importDesign(raw) {
  const fresh = normalize(raw);
  store.commit((d) => {
    Object.keys(d).forEach((k) => delete d[k]);
    Object.assign(d, fresh);
  });
  store.select(null);
}

export { HEAD_ROT };
