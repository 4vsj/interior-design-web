// Side panel: room, doors and windows, beds. Flat labelled fields only.
import { FRAMES, MATTRESS, REGIONS, SIZE_KEYS } from './beds.js';
import {
  bedDescription, bedName, bedRect, bedSize, clamp, fitOpening, headAgainst, keepHeadEdge,
  openingName, ROT_HEAD, WALL_LABEL, WALLS, wallInfo,
} from './geometry.js';
import { CLOSET_FINISHES, CLOSET_LIMITS, CLOSET_STYLES } from './closets.js';
import {
  clampEnsuite, CORNERS, doorFromLabel, ensuiteLayout, placeZone, doorRange, ENS_DOORS, ENS_LIMITS, sideLabels, STORAGE, WET,
} from './ensuite.js';
import {
  addBed, addCloset, addDesk, addEnsuite, addWalkin, addLight, addOpening, addStrip, ATTACH, clampOpeningHeights, deleteSelected, duplicateSelected,
  EFFECTS, hideTip, LIGHT_TYPES, LIMITS, maxCord, rotateSelected, setMode, showHiddenTips, store, stripTargets, SWINGS, TEMPS,
} from './state.js';
import {
  CASES, CHAIRS, COMPUTER, COOLERS, DESK_LIMITS, FINISHES, GPUS, KEYBOARDS, MONITORS, PARTS,
} from './desks.js';
import { closetDescription, closetName, deskName } from './geometry.js';
import { fieldStep, fieldValue, fmtMattress, fromDisplay, UNIT_LABEL } from './units.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function numberField(key, label, meters, units, { min = 0, max } = {}) {
  const u = UNIT_LABEL[units];
  const mn = fieldValue(min, units);
  const mx = max !== undefined ? ` max="${fieldValue(max, units)}"` : '';
  return `<label class="field"><span>${esc(label)}</span>
    <span class="input-wrap"><input type="number" data-key="${key}" value="${fieldValue(meters, units)}" step="${fieldStep(units)}" min="${mn}"${mx} inputmode="decimal"><em>${u}</em></span></label>`;
}

function plainNumber(key, label, value, unit, { min = 0, max = 100, step = 5 } = {}) {
  return `<label class="field"><span>${esc(label)}</span>
    <span class="input-wrap"><input type="number" data-key="${key}" value="${value}" step="${step}" min="${min}" max="${max}" inputmode="numeric"><em>${unit}</em></span></label>`;
}

function colorField(key, label, value) {
  return `<label class="field"><span>${esc(label)}</span><input type="color" data-key="${key}" value="${esc(value)}"></label>`;
}

const ONOFF = [['on', 'On'], ['off', 'Off']];

function selectField(key, label, value, options) {
  const opts = options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<label class="field"><span>${esc(label)}</span><select data-key="${key}">${opts}</select></label>`;
}

function openingEditor(d, op) {
  const u = d.units;
  const w = wallInfo(d.room, op.wall);
  const fromLabel = w.u.x ? 'From left corner' : 'From top corner';
  let html = selectField('op.wall', 'Wall', op.wall, WALLS.map((x) => [x, WALL_LABEL[x]]));
  html += numberField('op.pos', fromLabel, op.pos, u, { max: w.len - op.width });
  html += numberField('op.width', 'Width', op.width, u, { min: LIMITS.openingWidth.min, max: w.len });
  html += numberField('op.height', 'Height', op.height, u, { min: 0.3, max: d.room.height - op.sill });
  if (op.type === 'window') html += numberField('op.sill', 'Sill height', op.sill, u, { max: d.room.height - 0.3 });
  else html += selectField('op.swing', 'Opens', op.swing, Object.entries(SWINGS));
  return html;
}

function bedEditor(d, bed) {
  const u = d.units;
  const r = bedRect(bed);
  let html = selectField('bed.region', 'Size standard', bed.region, Object.entries(REGIONS));
  html += selectField('bed.size', 'Size', bed.size, SIZE_KEYS.map((k) => {
    const m = MATTRESS[bed.region][k];
    return [k, `${m.label}, ${fmtMattress(m.w, m.l, u)}`];
  }));
  html += selectField('bed.frame', 'Frame', bed.frame, Object.entries(FRAMES).map(([k, f]) => [k, f.label]));
  html += selectField('bed.head', 'Headboard against', ROT_HEAD[bed.rot], WALLS.map((x) => [x, WALL_LABEL[x]]));
  html += numberField('bed.left', 'From left wall', r.x0, u, { min: -10 });
  html += numberField('bed.top', 'From top wall', r.y0, u, { min: -10 });
  return html;
}

function deskEditor(d, k, part) {
  const u = d.units;
  // only offer the pieces this setup has
  const gone = { full: [], screen: ['pc'], none: ['pc', 'monitor', 'keyboard'] }[k.computer || 'full'];
  if (gone.includes(part)) part = 'setup';
  let html = selectField('desk.part', 'Editing', part, Object.entries(PARTS).filter(([p]) => !gone.includes(p)));
  if (part === 'setup') {
    const r = bedRect(k);
    html += selectField('desk.computer', 'On the desk', k.computer || 'full', Object.entries(COMPUTER));
    html += selectField('desk.back', 'Desk back against', ROT_HEAD[k.rot], WALLS.map((x) => [x, WALL_LABEL[x]]));
    html += numberField('desk.left', 'From left wall', r.x0, u, { min: -10 });
    html += numberField('desk.top', 'From top wall', r.y0, u, { min: -10 });
  } else if (part === 'desk') {
    html += selectField('dk.shape', 'Shape', k.desk.shape, [['straight', 'Straight'], ['l', 'L-shaped']]);
    html += numberField('dk.width', 'Width', k.desk.width, u, DESK_LIMITS.width);
    html += numberField('dk.depth', 'Depth', k.desk.depth, u, DESK_LIMITS.depth);
    html += numberField('dk.height', 'Height', k.desk.height, u, DESK_LIMITS.height);
    html += selectField('dk.finish', 'Finish', k.desk.finish, Object.entries(FINISHES));
  } else if (part === 'chair') {
    html += selectField('ch.style', 'Style', k.chair.style, Object.entries(CHAIRS));
    html += colorField('ch.color', 'Colour', k.chair.color);
  } else if (part === 'monitor') {
    html += selectField('mo.size', 'Size', k.monitor.size, Object.entries(MONITORS).map(([v, m]) => [v, m.label]));
    html += selectField('mo.count', 'Screens', String(k.monitor.count), [['1', 'Single'], ['2', 'Dual']]);
  } else if (part === 'keyboard') {
    html += selectField('kb.layout', 'Layout', k.keyboard.layout, Object.entries(KEYBOARDS).map(([v, m]) => [v, m.label]));
    html += selectField('kb.rgb', 'RGB', k.keyboard.rgb ? 'on' : 'off', ONOFF);
  } else if (part === 'pc') {
    html += selectField('pc.place', 'Placed', k.pc.place, [['desk', 'On the desk'], ['floor', 'On the floor']]);
    html += selectField('pc.style', 'Case', k.pc.style, Object.entries(CASES).map(([v, c]) => [v, c.label]));
    html += colorField('pc.color', 'Case colour', k.pc.color);
    html += selectField('pc.gpu', 'GPU', k.pc.gpu, Object.entries(GPUS).map(([v, g]) => [v, `${g.label}, ${g.fans} fan${g.fans > 1 ? 's' : ''}`]));
    html += selectField('pc.cooler', 'CPU cooler', k.pc.cooler, Object.entries(COOLERS));
    html += selectField('pc.rgb', 'RGB lighting', k.pc.rgb ? 'on' : 'off', ONOFF);
    if (k.pc.rgb) html += colorField('pc.rgbColor', 'RGB colour', k.pc.rgbColor);
  }
  return html;
}

function closetEditor(d, c) {
  const u = d.units;
  const r = bedRect(c);
  const k = c.closet;
  let html = selectField('cl.style', 'Style', k.style, Object.entries(CLOSET_STYLES));
  html += numberField('cl.width', 'Width', k.width, u, CLOSET_LIMITS.width);
  html += numberField('cl.depth', 'Depth', k.depth, u, CLOSET_LIMITS.depth);
  html += numberField('cl.height', 'Height', k.height, u, { min: CLOSET_LIMITS.height.min, max: Math.min(CLOSET_LIMITS.height.max, d.room.height) });
  html += selectField('cl.finish', 'Finish', k.finish, Object.entries(CLOSET_FINISHES));
  html += selectField('cl.back', 'Back against', ROT_HEAD[c.rot], WALLS.map((x) => [x, WALL_LABEL[x]]));
  html += numberField('cl.left', 'From left wall', r.x0, u, { min: -10 });
  html += numberField('cl.top', 'From top wall', r.y0, u, { min: -10 });
  return html;
}

const YESNO = [['on', 'Yes'], ['off', 'No']];

/** Corner, size and door fields shared by the ensuite and the walk-in closet. */
function zoneShell(d, e) {
  const u = d.units;
  const sides = sideLabels(e);
  const [, dMax] = doorRange(e);
  const r = ensuiteLayout(d.room, e).rect;
  let html = selectField('en.corner', 'Nearest corner', e.corner, Object.entries(CORNERS));
  html += numberField('en.left', 'From left wall', r.x0, u);
  html += numberField('en.top', 'From top wall', r.y0, u);
  html += numberField('en.width', 'Width (left to right)', e.width, u, { min: ENS_LIMITS.size.min, max: Math.min(ENS_LIMITS.size.max, d.room.width - 0.6) });
  html += numberField('en.length', 'Length (top to bottom)', e.length, u, { min: ENS_LIMITS.size.min, max: Math.min(ENS_LIMITS.size.max, d.room.length - 0.6) });
  html += selectField('en.doorSide', 'Door on', e.doorSide, [['v', sides.v], ['h', sides.h]]);
  html += numberField('en.doorAt', doorFromLabel(e), e.doorAt, u, { max: dMax });
  html += numberField('en.doorWidth', 'Door width', e.doorWidth, u, ENS_LIMITS.door);
  const doors = Object.entries(ENS_DOORS).map(([k, t]) => [k, k === 'in' && e.id === 'walkin' ? 'Swings into closet' : t]);
  html += selectField('en.door', 'Door', e.door, doors);
  return html;
}

function walkinEditor(d, e) {
  let html = zoneShell(d, e);
  html += selectField('en.storage', 'Storage', e.storage, Object.entries(STORAGE));
  html += selectField('en.finish', 'Finish', e.finish, Object.entries(CLOSET_FINISHES));
  html += selectField('en.mirror', 'Full-length mirror', e.mirror ? 'on' : 'off', YESNO);
  html += selectField('en.bench', 'Bench to sit on', e.bench ? 'on' : 'off', YESNO);
  return html;
}

function ensuiteEditor(d, e) {
  let html = zoneShell(d, e);
  html += selectField('en.wet', 'Shower or bath', e.wet, Object.entries(WET));
  html += selectField('en.toilet', 'Toilet', e.toilet ? 'on' : 'off', [['on', 'Yes'], ['off', 'No']]);
  html += selectField('en.vanity', 'Vanity and basin', e.vanity ? 'on' : 'off', [['on', 'Yes'], ['off', 'No']]);
  return html;
}

function ensuiteDescription(e) {
  return `${CORNERS[e.corner]} · ${WET[e.wet] === 'Neither' ? 'Toilet only' : WET[e.wet]}`;
}

function lightEditor(d, l) {
  const u = d.units;
  let html = selectField('li.type', 'Type', l.type, Object.entries(LIGHT_TYPES));
  if (l.type === 'pendant') html += numberField('li.cord', 'Cord length', l.cord, u, { min: 0.1, max: maxCord(d.room) });
  html += selectField('li.temp', 'Colour temperature', l.temp, Object.entries(TEMPS));
  html += plainNumber('li.brightness', 'Brightness', l.brightness, '%');
  html += numberField('li.left', 'From left wall', l.x, u);
  html += numberField('li.top', 'From top wall', l.y, u);
  return html;
}

function stripEditor(d, t) {
  let html = selectField('st.target', 'Attached to', `${t.attach}:${t.target || ''}`, stripTargets(d));
  html += selectField('st.on', 'Switch', t.on ? 'on' : 'off', ONOFF);
  html += colorField('st.color', 'Colour', t.color);
  html += selectField('st.effect', 'Effect', t.effect, Object.entries(EFFECTS));
  return html;
}

function stripLabel(d, t) {
  if (t.attach === 'ceiling') return 'Ceiling edge';
  if (t.attach === 'bed') return `Bed ${d.beds.findIndex((b) => b.id === t.target) + 1} frame`;
  const n = d.desks.findIndex((k) => k.id === t.target) + 1;
  return t.attach === 'desk' ? `Desk setup ${n} underside` : `Desk setup ${n} monitor`;
}

const itemActions = (rotate, duplicate = true) => `<div class="btnrow">
  ${rotate ? '<button data-act="rotate" title="Shortcut: R">Rotate 90°</button>' : ''}
  ${duplicate ? '<button data-act="duplicate" title="Shortcut: Ctrl+D">Duplicate</button>' : ''}
  <button data-act="delete" class="danger" title="Shortcut: Delete">Delete</button></div>`;

let lastSelKey = '';

// collapsed sections, remembered in this browser
const FOLD_KEY = 'bedroom-planner:folded';
const folded = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
})();
function saveFolded() {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...folded]));
  } catch {
    /* storage blocked: folding still works for this visit */
  }
}
const slug = (t) => t.toLowerCase().replace(/[^a-z]+/g, '-');
/** Section headers become buttons that fold the section away. */
function foldable(html) {
  return html.replace(/<section><h2>([^<]+)<\/h2>/g, (_, title) => {
    const f = slug(title);
    const open = !folded.has(f);
    return `<section${open ? '' : ' class="folded"'}><h2><button class="fold" data-fold="${f}" aria-expanded="${open}">${title}</button></h2>`;
  });
}
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function render(panel) {
  const d = store.design;
  const u = d.units;
  const sel = store.selected;
  const issues = store.analysis.issues;
  let html = '';

  // problems first, closed tips out of the way
  const shown = issues.filter((i) => !i.hidden).sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
  const hiddenCount = issues.length - shown.length;
  if (shown.length || hiddenCount) {
    html += '<div class="issues" aria-live="polite">';
    for (const i of shown) {
      html += `<div class="issue ${i.level}"><button class="issue-text" data-sel="${i.kind}:${i.id}" title="${esc(i.text)}">${esc(i.text)}</button>`;
      if (i.level === 'tip') html += `<button class="issue-x" data-hide="${esc(i.key)}" title="Hide this tip" aria-label="Hide this tip">×</button>`;
      html += '</div>';
    }
    if (hiddenCount) html += `<button class="linkish" data-act="show-tips">Show ${hiddenCount} hidden tip${hiddenCount > 1 ? 's' : ''}</button>`;
    html += '</div>';
  }

  html += `<section><h2>Room</h2>
    ${selectField('units', 'Units', u, [['m', 'Metres'], ['ft', 'Feet']])}
    ${numberField('room.width', 'Width (left to right)', d.room.width, u, LIMITS.room)}
    ${numberField('room.length', 'Length (top to bottom)', d.room.length, u, LIMITS.room)}
    ${numberField('room.height', 'Ceiling height', d.room.height, u, LIMITS.height)}
  </section>`;

  html += `<section><h2>Doors and windows</h2>
    <div class="btnrow"><button class="add" data-act="add-door">+ Add door</button><button class="add" data-act="add-window">+ Add window</button></div>`;
  if (!d.openings.length) html += '<p class="empty">Drag them along the walls once added.</p>';
  html += '<ul class="items">';
  for (const op of d.openings) {
    const isSel = sel && sel.kind === 'opening' && sel.id === op.id;
    html += `<li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="opening:${op.id}" aria-expanded="${isSel}">
      <b>${esc(openingName(d, op))}</b><span>${esc(WALL_LABEL[op.wall])}</span></button>`;
    if (isSel) html += `<div class="editor">${openingEditor(d, op)}${itemActions(false)}</div>`;
    html += '</li>';
  }
  html += '</ul></section>';

  html += `<section><h2>Beds</h2>
    <div class="btnrow"><button class="add" data-act="add-bed">+ Add bed</button></div>`;
  if (!d.beds.length) html += '<p class="empty">Drag beds in either view.</p>';
  html += '<ul class="items">';
  for (const bed of d.beds) {
    const isSel = sel && sel.kind === 'bed' && sel.id === bed.id;
    const err = store.analysis.beds[bed.id].error;
    html += `<li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="bed:${bed.id}" aria-expanded="${isSel}">
      <b>${esc(bedName(d, bed))}${err ? ' <i class="dot" title="Has a problem"></i>' : ''}</b><span>${esc(bedDescription(bed))}</span></button>`;
    if (isSel) html += `<div class="editor">${bedEditor(d, bed)}${itemActions(true)}</div>`;
    html += '</li>';
  }
  html += '</ul></section>';

  html += `<section><h2>Desk setups</h2>
    <div class="btnrow"><button class="add" data-act="add-desk">+ Add desk setup</button></div>`;
  if (!d.desks.length) html += '<p class="empty">Desk, chair and PC as one group. The PC is optional.</p>';
  html += '<ul class="items">';
  for (const k of d.desks) {
    const isSel = sel && sel.kind === 'desk' && sel.id === k.id;
    const err = store.analysis.items[k.id].error;
    html += `<li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="desk:${k.id}" aria-expanded="${isSel}">
      <b>${esc(deskName(d, k))}${err ? ' <i class="dot" title="Has a problem"></i>' : ''}</b><span>${esc(`${k.desk.shape === 'l' ? 'L-shaped' : 'Straight'} · ${k.computer === 'none' ? 'Desk only' : k.computer === 'screen' ? 'No PC' : CASES[k.pc.style].label.split(',')[0]}`)}</span></button>`;
    if (isSel) html += `<div class="editor">${deskEditor(d, k, sel.part || 'setup')}${itemActions(true)}</div>`;
    html += '</li>';
  }
  html += '</ul></section>';

  html += `<section><h2>Closets</h2>
    <div class="btnrow"><button class="add" data-act="add-closet">+ Add closet</button></div>`;
  if (!d.closets.length) html += '<p class="empty">Hinged, sliding or open wardrobes.</p>';
  html += '<ul class="items">';
  for (const c of d.closets) {
    const isSel = sel && sel.kind === 'closet' && sel.id === c.id;
    const err = store.analysis.items[c.id].error;
    html += `<li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="closet:${c.id}" aria-expanded="${isSel}">
      <b>${esc(closetName(d, c))}${err ? ' <i class="dot" title="Has a problem"></i>' : ''}</b><span>${esc(closetDescription(c))}</span></button>`;
    if (isSel) html += `<div class="editor">${closetEditor(d, c)}${itemActions(true)}</div>`;
    html += '</li>';
  }
  html += '</ul></section>';

  html += '<section><h2>Ensuite bathroom</h2>';
  if (!d.ensuite) {
    html += `<div class="btnrow"><button class="add" data-act="add-ensuite">+ Add ensuite</button></div>
      <p class="empty">A walled-off bathroom in one corner.</p>`;
  } else {
    const e = d.ensuite;
    const isSel = sel && sel.kind === 'ensuite';
    const err = store.analysis.items.ensuite.error;
    html += `<ul class="items"><li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="ensuite:ensuite" aria-expanded="${isSel}">
      <b>Ensuite${err ? ' <i class="dot" title="Has a problem"></i>' : ''}</b><span>${esc(ensuiteDescription(e))}</span></button>`;
    if (isSel) html += `<div class="editor">${ensuiteEditor(d, e)}${itemActions(false, false)}</div>`;
    html += '</li></ul>';
  }
  html += '</section>';

  html += '<section><h2>Walk-in closet</h2>';
  if (!d.walkin) {
    html += `<div class="btnrow"><button class="add" data-act="add-walkin">+ Add walk-in closet</button></div>
      <p class="empty">A walled-off changing room in one corner.</p>`;
  } else {
    const e = d.walkin;
    const isSel = sel && sel.kind === 'walkin';
    const err = store.analysis.items.walkin.error;
    html += `<ul class="items"><li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="walkin:walkin" aria-expanded="${isSel}">
      <b>Walk-in closet${err ? ' <i class="dot" title="Has a problem"></i>' : ''}</b><span>${esc(`${CORNERS[e.corner]} · ${e.storage === 'two' ? 'Rail and shelves' : 'Rail'}`)}</span></button>`;
    if (isSel) html += `<div class="editor">${walkinEditor(d, e)}${itemActions(false, false)}</div>`;
    html += '</li></ul>';
  }
  html += '</section>';

  const night = d.lighting.mode === 'night';
  html += `<section><h2>Lighting</h2>
    <div class="field"><span>Time of day</span><div class="toggle small" role="group" aria-label="Time of day">
      <button data-act="mode-day" aria-pressed="${!night}">Day</button><button data-act="mode-night" aria-pressed="${night}">Night</button></div></div>
    <div class="btnrow"><button class="add" data-act="add-light">+ Ceiling light</button><button class="add" data-act="add-strip">+ LED strip</button></div>`;
  if (!d.lighting.lights.length && !d.lighting.strips.length) html += '<p class="empty">Switch to night to see lights glow in 3D.</p>';
  html += '<ul class="items">';
  d.lighting.lights.forEach((l, i) => {
    const isSel = sel && sel.kind === 'light' && sel.id === l.id;
    html += `<li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="light:${l.id}" aria-expanded="${isSel}">
      <b>Light ${i + 1}</b><span>${esc(LIGHT_TYPES[l.type])}</span></button>`;
    if (isSel) html += `<div class="editor">${lightEditor(d, l)}${itemActions(false)}</div>`;
    html += '</li>';
  });
  d.lighting.strips.forEach((t, i) => {
    const isSel = sel && sel.kind === 'strip' && sel.id === t.id;
    html += `<li class="${isSel ? 'sel' : ''}"><button class="item" data-sel="strip:${t.id}" aria-expanded="${isSel}">
      <b><i class="swatch" style="background:${esc(t.color)}"></i>LED strip ${i + 1}</b><span>${esc(stripLabel(d, t))}${t.on ? '' : ', off'}</span></button>`;
    if (isSel) html += `<div class="editor">${stripEditor(d, t)}${itemActions(false)}</div>`;
    html += '</li>';
  });
  html += '</ul></section>';

  // keep focus on the same field across re-renders
  const active = document.activeElement;
  const focusKey = active && panel.contains(active) ? active.dataset.key || active.dataset.act || active.dataset.sel : null;
  const scroll = panel.scrollTop;
  panel.innerHTML = foldable(html);
  panel.scrollTop = scroll;
  for (const sec of panel.querySelectorAll('section.folded')) {
    // a section never hides the thing being edited
    if (sec.querySelector('li.sel')) {
      sec.classList.remove('folded');
      sec.querySelector('.fold').setAttribute('aria-expanded', 'true');
    }
    const n = sec.querySelectorAll('ul.items > li').length;
    if (n) sec.querySelector('.fold').dataset.count = n;
  }
  // a new selection brings its fields into view, wherever the panel was scrolled to
  const selKey = sel ? `${sel.kind}:${sel.id}` : '';
  if (selKey && selKey !== lastSelKey) {
    const li = panel.querySelector('li.sel');
    if (li) {
      const pr = panel.getBoundingClientRect();
      const lr = li.getBoundingClientRect();
      const fits = lr.top >= pr.top && lr.bottom <= pr.bottom;
      if (!fits) {
        // line the item's header up with the top of the panel
        panel.scrollTo({ top: Math.max(0, lr.top - pr.top + panel.scrollTop - 8), behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
    }
  }
  lastSelKey = selKey;
  if (focusKey) {
    const el = panel.querySelector(`[data-key="${focusKey}"],[data-act="${focusKey}"],[data-sel="${focusKey}"]`);
    if (el) el.focus();
  }
}

function onChange(e) {
  const el = e.target;
  const key = el.dataset.key;
  if (!key) return;
  const d0 = store.design;
  const units = d0.units;
  const raw = el.type === 'number' ? parseFloat(el.value) : el.value;
  if (el.type === 'number' && !Number.isFinite(raw)) {
    store.emit(); // put the old value back
    return;
  }
  // brightness is a percentage, not a length
  const m = el.type === 'number' ? (key === 'li.brightness' ? raw : fromDisplay(raw, units)) : null;
  const sel = store.selected;

  if (key === 'units') {
    store.commit((d) => { d.units = raw; });
    return;
  }

  if (key.startsWith('room.')) {
    const prop = key.slice(5);
    const lim = prop === 'height' ? LIMITS.height : LIMITS.room;
    const v = clamp(m, lim.min, lim.max);
    const ok = store.commit((d) => {
      d.room[prop] = v;
      if (d.ensuite) clampEnsuite(d.room, d.ensuite);
      if (d.walkin) clampEnsuite(d.room, d.walkin);
      for (const c of d.closets) c.closet.height = Math.min(c.closet.height, d.room.height);
      for (const op of d.openings) {
        clampOpeningHeights(op, d.room.height);
        const pos = fitOpening(d, op, op.wall, op.pos);
        if (pos === null) return false;
        op.pos = pos;
      }
    });
    if (!ok) store.flash('The doors and windows would no longer fit on a wall that short. Move or narrow them first.');
    else if (v !== m) store.flash(`Room ${prop === 'height' ? 'ceiling height' : prop} is limited to ${fieldValue(lim.min, units)} to ${fieldValue(lim.max, units)} ${UNIT_LABEL[units]}.`);
    return;
  }

  if (key.startsWith('op.') && sel) {
    const prop = key.slice(3);
    const ok = store.commit((d) => {
      const op = d.openings.find((o) => o.id === sel.id);
      if (!op) return false;
      if (prop === 'swing') {
        op.swing = raw;
        return true;
      }
      if (prop === 'wall') {
        const len = wallInfo(d.room, raw).len;
        const pos = fitOpening(d, op, raw, Math.min(op.pos, len - op.width));
        if (pos === null) return false;
        op.wall = raw;
        op.pos = pos;
        return true;
      }
      if (prop === 'pos') {
        const pos = fitOpening(d, op, op.wall, m);
        if (pos === null) return false;
        op.pos = pos;
        return true;
      }
      if (prop === 'width') {
        op.width = Math.max(LIMITS.openingWidth.min, m);
        const pos = fitOpening(d, op, op.wall, op.pos);
        if (pos === null) return false;
        op.pos = pos;
        return true;
      }
      if (prop === 'height') op.height = m;
      if (prop === 'sill') {
        op.sill = m;
        // raising the sill keeps the window height where it fits
        op.height = Math.min(op.height, d.room.height - clamp(m, 0, d.room.height - 0.3));
      }
      clampOpeningHeights(op, d.room.height);
      return true;
    });
    if (!ok) store.flash('That does not fit there without running past the wall or overlapping another door or window.');
    return;
  }

  if (key === 'desk.part' && sel) {
    store.select({ ...sel, part: raw });
    return;
  }
  const deskKeys = ['desk.', 'dk.', 'ch.', 'mo.', 'kb.', 'pc.'];
  if (sel && sel.kind === 'desk' && deskKeys.some((p) => key.startsWith(p))) {
    const [grp, prop] = key.split('.');
    store.commit((d) => {
      const k = d.desks.find((x) => x.id === sel.id);
      if (!k) return false;
      if (grp === 'desk') {
        if (prop === 'back') Object.assign(k, headAgainst(d.room, k, raw));
        else if (prop === 'computer') k.computer = raw;
        else if (prop === 'left') k.x = m + bedSize(k).fw / 2;
        else if (prop === 'top') k.y = m + bedSize(k).fh / 2;
        return true;
      }
      const old = JSON.parse(JSON.stringify(k));
      if (grp === 'dk') {
        if (DESK_LIMITS[prop]) k.desk[prop] = clamp(m, DESK_LIMITS[prop].min, DESK_LIMITS[prop].max);
        else k.desk[prop] = raw;
        // keep the back of the desk where it was
        Object.assign(k, keepHeadEdge(old, k));
      } else if (grp === 'ch') k.chair[prop] = raw;
      else if (grp === 'mo') k.monitor[prop] = prop === 'count' ? Number(raw) : raw;
      else if (grp === 'kb') k.keyboard[prop] = prop === 'rgb' ? raw === 'on' : raw;
      else if (grp === 'pc') k.pc[prop] = prop === 'rgb' ? raw === 'on' : raw;
      return true;
    });
    return;
  }
  if (sel && sel.kind === 'closet' && key.startsWith('cl.')) {
    const prop = key.slice(3);
    store.commit((d) => {
      const c = d.closets.find((x) => x.id === sel.id);
      if (!c) return false;
      if (prop === 'back') Object.assign(c, headAgainst(d.room, c, raw));
      else if (prop === 'left') c.x = m + bedSize(c).fw / 2;
      else if (prop === 'top') c.y = m + bedSize(c).fh / 2;
      else {
        const old = JSON.parse(JSON.stringify(c));
        if (CLOSET_LIMITS[prop]) {
          const lim = CLOSET_LIMITS[prop];
          c.closet[prop] = clamp(m, lim.min, prop === 'height' ? Math.min(lim.max, d.room.height) : lim.max);
        } else c.closet[prop] = raw;
        // keep the back against the same wall
        Object.assign(c, keepHeadEdge(old, c));
      }
      return true;
    });
    return;
  }
  if (sel && (sel.kind === 'ensuite' || sel.kind === 'walkin') && key.startsWith('en.')) {
    const prop = key.slice(3);
    store.commit((d) => {
      const e = d[sel.kind];
      if (!e) return false;
      const r = ensuiteLayout(d.room, e).rect;
      if (prop === 'left' || prop === 'top') {
        placeZone(d.room, e, prop === 'left' ? m : r.x0, prop === 'top' ? m : r.y0, 0.005, 0.01);
        return true;
      }
      if (prop === 'corner') {
        // a new corner starts flush in that corner
        e.corner = raw;
        e.offX = 0;
        e.offY = 0;
      } else if (['toilet', 'vanity', 'mirror', 'bench'].includes(prop)) e[prop] = raw === 'on';
      else if (el.type === 'number') e[prop] = m;
      else e[prop] = raw;
      clampEnsuite(d.room, e);
      return true;
    });
    return;
  }
  if (sel && sel.kind === 'light' && key.startsWith('li.')) {
    const prop = key.slice(3);
    store.commit((d) => {
      const l = d.lighting.lights.find((x) => x.id === sel.id);
      if (!l) return false;
      if (prop === 'brightness') l.brightness = clamp(Math.round(raw), 0, 100);
      else if (prop === 'cord') l.cord = clamp(m, 0.1, maxCord(d.room));
      else if (prop === 'left') l.x = clamp(m, 0, d.room.width);
      else if (prop === 'top') l.y = clamp(m, 0, d.room.length);
      else l[prop] = raw;
      return true;
    });
    return;
  }
  if (sel && sel.kind === 'strip' && key.startsWith('st.')) {
    const prop = key.slice(3);
    store.commit((d) => {
      const t = d.lighting.strips.find((x) => x.id === sel.id);
      if (!t) return false;
      if (prop === 'target') {
        const [attach, target] = raw.split(':');
        t.attach = attach;
        t.target = target || null;
      } else if (prop === 'on') t.on = raw === 'on';
      else t[prop] = raw;
      return true;
    });
    return;
  }

  if (key.startsWith('bed.') && sel) {
    const prop = key.slice(4);
    store.commit((d) => {
      const bed = d.beds.find((b) => b.id === sel.id);
      if (!bed) return false;
      if (prop === 'region' || prop === 'size' || prop === 'frame') {
        const old = { ...bed };
        bed[prop] = raw;
        if (prop === 'region') d.region = raw;
        Object.assign(bed, keepHeadEdge(old, bed));
      } else if (prop === 'head') {
        Object.assign(bed, headAgainst(d.room, bed, raw));
      } else if (prop === 'left') {
        bed.x = m + bedSize(bed).fw / 2;
      } else if (prop === 'top') {
        bed.y = m + bedSize(bed).fh / 2;
      }
      return true;
    });
  }
}

function onClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'add-door') addOpening('door');
  else if (act === 'add-window') addOpening('window');
  else if (act === 'add-bed') addBed();
  else if (act === 'add-desk') addDesk();
  else if (act === 'add-closet') addCloset();
  else if (act === 'add-ensuite') addEnsuite();
  else if (act === 'add-walkin') addWalkin();
  else if (act === 'add-light') addLight();
  else if (act === 'add-strip') addStrip();
  else if (act === 'mode-day') setMode('day');
  else if (act === 'mode-night') setMode('night');
  else if (act === 'delete') deleteSelected();
  else if (act === 'duplicate') duplicateSelected();
  else if (act === 'rotate') rotateSelected();
  else if (act === 'show-tips') showHiddenTips();
  else if (btn.dataset.hide) hideTip(btn.dataset.hide);
  else if (btn.dataset.fold) {
    const f = btn.dataset.fold;
    if (folded.has(f)) folded.delete(f);
    else folded.add(f);
    saveFolded();
    // folding away the item being edited drops the selection with it
    if (folded.has(f) && btn.closest('section').querySelector('li.sel')) store.select(null);
    else render(btn.closest('.panel'));
  } else if (btn.dataset.sel) {
    const [kind, id] = btn.dataset.sel.split(':');
    const same = store.selected && store.selected.id === id;
    store.select(same && btn.classList.contains('item') ? null : { kind, id, part: kind === 'desk' ? 'setup' : undefined });
  }
}

export function createPanel(panel) {
  panel.addEventListener('change', onChange);
  panel.addEventListener('click', onClick);
  // Enter commits a number field without leaving it
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[type=number]')) e.target.dispatchEvent(new Event('change', { bubbles: true }));
  });
  let queued = false;
  return {
    render() {
      // deferred so a Tab press has moved focus before we rebuild the fields
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render(panel);
      });
    },
  };
}
