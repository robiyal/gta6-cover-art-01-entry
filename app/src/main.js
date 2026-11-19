// Neon Vice wiring: photos, panel picking, controls, export, and ?shot= scenes.
// State lives in one plain object; every control mutates it and calls redraw().

import { drawCover, panelAt, LAYOUTS } from './cover.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const $ = (id) => document.getElementById(id);

// --- state -----------------------------------------------------------------
const state = {
  layout: 'slash3',
  grade: 'neon',
  glow: true,
  title: 'NEON VICE',
  subtitle: 'VICE CITY NIGHTS',
  titleSize: 104,
  spot: 'bottom',
  size: '1080x1080',
  photos: {},          // id -> HTMLImageElement
  photoNames: {},      // id -> display name
  panels: [],          // one per layout slot: { photoId, zoom, ox, oy }
  selected: 0,
};

const SAMPLES = [
  { id: 'pier', name: 'Pier', url: './samples/pier.jpg' },
  { id: 'boulevard', name: 'Boulevard', url: './samples/boulevard.jpg' },
];

function defaultPanels(layout, firstPhoto, secondPhoto) {
  const count = (LAYOUTS[layout] || LAYOUTS.slash3).length;
  const slots = [];
  // Vary the framing per panel so a photo reused in two panels never looks
  // like a mirrored copy: each slot gets its own zoom and pan.
  const framing = [
    { zoom: 1.15, ox: 0, oy: 0 },
    { zoom: 1.30, ox: 0.08, oy: 0.04 },
    { zoom: 1.55, ox: -0.12, oy: -0.04 },
    { zoom: 1.35, ox: 0.10, oy: 0.02 },
  ];
  for (let i = 0; i < count; i++) {
    const f = framing[i % framing.length];
    slots.push({ photoId: i % 2 === 0 ? firstPhoto : secondPhoto, zoom: f.zoom, ox: f.ox, oy: f.oy });
  }
  return slots;
}

function redraw() {
  drawCover(canvas, state);
}

function setSize(size) {
  const [w, h] = size.split('x').map(Number);
  state.size = size;
  canvas.width = w;
  canvas.height = h;
  redraw();
}

function setLayout(layout) {
  state.layout = layout;
  state.panels = defaultPanels(layout, state.panels[0]?.photoId || 'pier', state.panels[1]?.photoId || 'boulevard');
  state.selected = 0;
  syncPanelTools();
  redraw();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image'));
    img.src = url;
  });
}

async function addPhoto(id, name, url) {
  const img = await loadImage(url);
  state.photos[id] = img;
  state.photoNames[id] = name;
  refreshPhotoSelect();
  updatePhotoCount();
  return img;
}

function refreshPhotoSelect() {
  const sel = $('panelPhoto');
  sel.innerHTML = '';
  for (const id of Object.keys(state.photos)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = state.photoNames[id] || id;
    sel.appendChild(opt);
  }
  const current = state.panels[state.selected];
  if (current) sel.value = current.photoId;
}

function updatePhotoCount() {
  const n = Object.keys(state.photos).length;
  $('photoCount').textContent = `${n} photo${n === 1 ? '' : 's'} loaded. Click a panel, then pick its photo below.`;
}

function syncPanelTools() {
  const panel = state.panels[state.selected];
  if (!panel) return;
  $('panelPhoto').value = panel.photoId;
  $('panelZoom').value = String(panel.zoom);
}

function markPickedSample(id) {
  document.querySelectorAll('#samples .thumb').forEach((b) => {
    b.classList.toggle('picked', b.dataset.sample === id);
  });
}

// --- controls ---------------------------------------------------------------
function wireControls() {
  document.querySelectorAll('#layoutSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#layoutSeg button').forEach((b) => b.classList.toggle('on', b === btn));
      setLayout(btn.dataset.layout);
    });
  });
  document.querySelectorAll('#gradeSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#gradeSeg button').forEach((b) => b.classList.toggle('on', b === btn));
      state.grade = btn.dataset.grade;
      redraw();
    });
  });
  document.querySelectorAll('#sizeSeg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sizeSeg button').forEach((b) => b.classList.toggle('on', b === btn));
      setSize(btn.dataset.size);
      statusEl.textContent = `Preview at ${btn.dataset.size}. Export writes exactly that size.`;
    });
  });

  $('grain').addEventListener('change', (e) => {
    state.glow = e.target.checked;
    redraw();
  });
  $('title').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
  $('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
  $('titleSpot').addEventListener('change', (e) => { state.spot = e.target.value; redraw(); });
  $('titleSize').addEventListener('input', (e) => { state.titleSize = Number(e.target.value); redraw(); });

  $('panelPhoto').addEventListener('change', (e) => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.photoId = e.target.value;
    markPickedSample(panel.photoId);
    redraw();
  });
  $('panelZoom').addEventListener('input', (e) => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.zoom = Number(e.target.value);
    redraw();
  });
  $('panelCenter').addEventListener('click', () => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.ox = 0; panel.oy = 0; panel.zoom = 1.15;
    syncPanelTools();
    redraw();
  });
  $('panelSwap').addEventListener('click', () => {
    const ids = Object.keys(state.photos);
    if (ids.length < 2) return;
    const panel = state.panels[state.selected];
    const next = ids[(ids.indexOf(panel.photoId) + 1) % ids.length];
    panel.photoId = next;
    syncPanelTools();
    markPickedSample(next);
    redraw();
  });

  // Uploads: file picker + drag and drop onto the dropzone or the canvas.
  $('upload').addEventListener('change', (e) => handleFiles(e.target.files));
  const dz = $('dropzone');
  dz.addEventListener('click', () => $('upload').click());
  ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault();
    dz.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault();
    dz.classList.remove('over');
  }));
  dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  });

  document.querySelectorAll('#samples .thumb').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = state.panels[state.selected];
      if (!panel) return;
      panel.photoId = btn.dataset.sample;
      markPickedSample(btn.dataset.sample);
      syncPanelTools();
      redraw();
    });
  });

  $('export').addEventListener('click', exportPng);
  $('exportTop').addEventListener('click', exportPng);
}

async function handleFiles(files) {
  const images = [...(files || [])].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  for (const file of images) {
    const id = `up${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const url = URL.createObjectURL(file);
    try {
      await addPhoto(id, file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Uploaded', url);
      const panel = state.panels[state.selected];
      if (panel) panel.photoId = id;
      markPickedSample(id);
      syncPanelTools();
    } catch {
      statusEl.textContent = `Could not read ${file.name}.`;
    }
  }
  redraw();
  statusEl.textContent = `${images.length} photo${images.length === 1 ? '' : 's'} added to the selected panel.`;
}

// --- panel dragging on the canvas -------------------------------------------
function wireCanvasDrag() {
  let dragging = null;
  let lastX = 0;
  let lastY = 0;

  function toNormalised(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
      rect,
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const { nx, ny } = toNormalised(e);
    const hit = panelAt(state.layout, nx, ny);
    if (hit < 0) return;
    state.selected = hit;
    syncPanelTools();
    dragging = state.panels[hit];
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    dragging.ox += (e.clientX - lastX) / rect.width;
    dragging.oy += (e.clientY - lastY) / rect.height;
    dragging.ox = Math.max(-0.6, Math.min(0.6, dragging.ox));
    dragging.oy = Math.max(-0.6, Math.min(0.6, dragging.oy));
    lastX = e.clientX;
    lastY = e.clientY;
    redraw();
  });
  const stop = () => { dragging = null; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('wheel', (e) => {
    const { nx, ny } = toNormalised(e);
    const hit = panelAt(state.layout, nx, ny);
    if (hit < 0) return;
    e.preventDefault();
    const panel = state.panels[hit];
    state.selected = hit;
    panel.zoom = Math.max(1, Math.min(3, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    syncPanelTools();
    redraw();
  }, { passive: false });
}

// --- export ------------------------------------------------------------------
function exportPng() {
  canvas.toBlob((blob) => {
    if (!blob) {
      statusEl.textContent = 'Export failed in this browser.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neon-vice-${state.size}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    statusEl.textContent = `Saved neon-vice-${state.size}.png (${Math.round(blob.size / 1024)} KiB).`;
  }, 'image/png');
}

// --- ?shot= scenes for screenshots ------------------------------------------
async function runShot(query) {
  const shot = query.get('shot');
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const photo = query.get('photo') || 'pier';
  const caption = query.get('caption') || 'NEON VICE';
  const sub = query.get('sub') || 'VICE CITY NIGHTS';
  const grade = query.get('grade') || 'neon';
  const layout = query.get('layout') || 'slash3';
  const size = query.get('size') || '1080x1080';
  state.title = caption;
  state.subtitle = sub;
  state.grade = grade;
  setSize(size);
  setLayout(layout);
  // The shot's photo fills every panel unless a second sample is named;
  // with none named, alternate with the other sample, as the app does.
  const second = query.get('photo2') || (photo === 'pier' ? 'boulevard' : 'pier');
  state.panels = state.panels.map((p, i) => ({
    ...p,
    photoId: second && i % 2 === 1 ? second : photo,
  }));
  document.querySelectorAll('#gradeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.grade === grade));
  document.querySelectorAll('#layoutSeg button').forEach((b) => b.classList.toggle('on', b.dataset.layout === layout));
  document.querySelectorAll('#sizeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.size === size));
  $('title').value = caption;
  $('subtitle').value = sub;
  redraw();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__shotReady = true;
}

// --- boot --------------------------------------------------------------------
async function boot() {
  wireControls();
  wireCanvasDrag();
  const query = new URLSearchParams(location.search);
  if (query.get('shot')) {
    // Shot mode: samples only, no upload interaction needed.
    await addPhoto('pier', 'Pier', './samples/pier.jpg');
    await addPhoto('boulevard', 'Boulevard', './samples/boulevard.jpg');
    state.panels = defaultPanels('slash3', 'pier', 'boulevard');
    await runShot(query);
    return;
  }
  state.panels = defaultPanels('slash3', 'pier', 'boulevard');
  setSize(state.size);
  await addPhoto('pier', 'Pier', './samples/pier.jpg');
  await addPhoto('boulevard', 'Boulevard', './samples/boulevard.jpg');
  markPickedSample('pier');
  syncPanelTools();
  redraw();
}

boot().catch((err) => {
  statusEl.textContent = `Could not start the app: ${err.message}`;
});
