import './style.css';
import { createPanel } from './panel.js';
import {
  deleteSelected, duplicateSelected, exportable, importDesign, newDesign, nudgeSelected, rotateSelected, store,
} from './state.js';
import { GRID } from './geometry.js';
import { createPlanView } from './view2d.js';
import { createScene } from './view3d.js';

const $ = (s) => document.querySelector(s);

const plan = createPlanView($('#plan'), store);
const panel = createPanel($('#panel'));
let scene = null;
function getScene() {
  if (!scene) {
    try {
      scene = createScene($('#three'), store);
    } catch (err) {
      console.error(err);
      store.flash('3D view needs WebGL, which this browser has turned off.');
    }
  }
  return scene;
}

const hint = $('#hint');
const HINTS = {
  '2d': 'Drag furniture, doors, windows and lights to move them. R rotates the selected bed or desk.',
  '3d': 'WASD to move, Q/E for down/up, Shift for speed. Drag to look, right-drag to pan, scroll to zoom.',
};

function setView(v) {
  store.view = v;
  document.body.dataset.view = v;
  for (const b of document.querySelectorAll('button[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
  hint.textContent = HINTS[v];
  const s = v === '3d' ? getScene() : scene;
  if (s) s.setActive(v === '3d');
  if (v === '2d') plan.draw();
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4500);
}

store.subscribe((st, evt) => {
  if (evt && evt.flash) {
    toast(evt.flash);
    return;
  }
  panel.render();
  if (st.view === '2d') plan.draw();
  else if (scene) scene.sync();
  $('#undo').disabled = !st.past.length;
  $('#redo').disabled = !st.future.length;
  $('#saved').textContent = st.saved ? 'Saved in this browser' : 'Could not save in this browser';
});

for (const b of document.querySelectorAll('button[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
$('#undo').addEventListener('click', () => store.undo());
$('#cam-overview').addEventListener('click', () => scene && scene.overview());
$('#cam-eye').addEventListener('click', () => scene && scene.eyeLevel());
$('#redo').addEventListener('click', () => store.redo());
$('#new').addEventListener('click', () => {
  newDesign();
  toast('Started a new room. Undo brings the old one back.');
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportable(store.design), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bedroom-plan.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

const fileInput = $('#import-file');
$('#import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files[0];
  fileInput.value = '';
  if (!f) return;
  try {
    importDesign(JSON.parse(await f.text()));
    toast(`Opened ${f.name}.`);
  } catch (err) {
    toast(`Could not open ${f.name}. Pick a .json plan exported from this planner.`);
  }
});

window.addEventListener('keydown', (e) => {
  const t = e.target;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (t.matches && t.matches('input, select, textarea')) {
    // fields commit on change, so undo/redo inside one should act on the plan
    if (mod && (k === 'z' || k === 'y')) {
      t.blur();
      if (k === 'y' || e.shiftKey) store.redo();
      else store.undo();
      e.preventDefault();
    }
    return;
  }
  if (mod && k === 'z' && !e.shiftKey) store.undo();
  else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) store.redo();
  else if (mod && k === 'd') duplicateSelected();
  else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) deleteSelected();
  else if (!mod && k === 'r') rotateSelected();
  else if (e.key === 'Escape') store.select(null);
  else if (e.key.startsWith('Arrow') && store.selected) {
    const dx = e.key === 'ArrowLeft' ? -GRID : e.key === 'ArrowRight' ? GRID : 0;
    const dy = e.key === 'ArrowUp' ? -GRID : e.key === 'ArrowDown' ? GRID : 0;
    nudgeSelected(dx, dy);
  } else return;
  e.preventDefault();
});

setView('2d');
store.emit();

// exposed for automated checks
window.__planner = { store, get scene() { return scene; } };
