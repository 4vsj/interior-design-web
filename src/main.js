import './style.css';
import { createPanel } from './panel.js';
import {
  deleteSelected, duplicateSelected, exportable, importDesign, newDesign, nudgeSelected, rotateSelected, store,
} from './state.js';
import { GRID } from './geometry.js';
import { createPlanView } from './view2d.js';

const $ = (s) => document.querySelector(s);

const plan = createPlanView($('#plan'), store);
const panel = createPanel($('#panel'));
// The 3D engine is most of the download, so it loads the first time the 3D view opens.
let scene = null;
let loading = null;
function loadScene() {
  if (scene) return Promise.resolve(scene);
  if (!loading) {
    document.body.classList.add('loading-3d');
    loading = import('./view3d.js')
      .then(({ createScene }) => {
        scene = createScene($('#three'), store);
        window.__planner.scene = scene;
        return scene;
      })
      .catch((err) => {
        console.error(err);
        store.flash('The 3D view could not start. It needs WebGL, which this browser may have turned off.');
        return null;
      })
      .finally(() => {
        document.body.classList.remove('loading-3d');
        loading = null;
      });
  }
  return loading;
}
// warm the cache once the page is idle so the first switch feels instant
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => import('./view3d.js').catch(() => {}));

const hint = $('#hint');
const HINTS = {
  '2d': 'Drag furniture, doors, windows and lights to move them. R rotates the selected bed, desk or closet.',
  '3d': 'WASD to move, Q/E for down/up, Shift for speed. Drag to look, right-drag to pan, scroll to zoom.',
};

const VIEW_HINT = {
  '2d': 'View only: nothing can be selected or moved. Press V or Edit to make changes.',
  '3d': 'View only. WASD to move, Q/E for down/up, Shift for speed. Drag to look, scroll to zoom. Press V or Edit to make changes.',
};

/** View-only mode: the panel goes away and nothing can be selected, dragged or changed. */
function setMode(mode) {
  store.viewOnly = mode === 'view';
  document.body.classList.toggle('viewing', store.viewOnly);
  for (const b of document.querySelectorAll('button[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  hint.textContent = (store.viewOnly ? VIEW_HINT : HINTS)[store.view];
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  store.select(null);
}

function setView(v) {
  store.view = v;
  document.body.dataset.view = v;
  for (const b of document.querySelectorAll('button[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
  hint.textContent = (store.viewOnly ? VIEW_HINT : HINTS)[v];
  if (v === '3d') {
    loadScene().then((s) => {
      if (s && store.view === '3d') s.setActive(true);
    });
  } else {
    if (scene) scene.setActive(false);
    plan.draw();
  }
}

let toastTimer = null;
/** A short message. With undo, it carries an Undo button for the step that was just made. */
function toast(msg, undo = false) {
  const t = $('#toast');
  t.textContent = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.append(span);
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.addEventListener('click', () => {
      store.undo();
      t.hidden = true;
    });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), undo ? 6000 : 4500);
}

store.subscribe((st, evt) => {
  if (evt && evt.flash) {
    toast(evt.flash, evt.undo);
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
for (const b of document.querySelectorAll('button[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
$('#undo').addEventListener('click', () => store.undo());
$('#cam-overview').addEventListener('click', () => scene && scene.overview());
$('#cam-eye').addEventListener('click', () => scene && scene.eyeLevel());
$('#redo').addEventListener('click', () => store.redo());
$('#new').addEventListener('click', () => {
  newDesign();
  toast('Started a new room.', true);
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
  if (!mod && k === 'v') {
    setMode(store.viewOnly ? 'edit' : 'view');
    e.preventDefault();
    return;
  }
  if (store.viewOnly) return; // looking only: no shortcut changes the plan
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
window.__planner = { store, scene };
