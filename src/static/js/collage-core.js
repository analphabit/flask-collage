/**
 * Image Collage Tool — Core Module
 * Manages canvas, layout calculation, frame rendering, and settings.
 */

// ─── Layout presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { id: '1x1', label: '1×1', cols: 1, rows: 1 },
  { id: '2x1', label: '2×1', cols: 2, rows: 1 },
  { id: '1x2', label: '1×2', cols: 1, rows: 2 },
  { id: '2x2', label: '2×2', cols: 2, rows: 2 },
  { id: '3x1', label: '3×1', cols: 3, rows: 1 },
  { id: '1x3', label: '1×3', cols: 1, rows: 3 },
  { id: '3x2', label: '3×2', cols: 3, rows: 2 },
  { id: '2x3', label: '2×3', cols: 2, rows: 3 },
];

// ─── Global state ─────────────────────────────────────────────────────────────

let canvas;

let currentLayout   = { cols: 2, rows: 1 };
let currentPresetId = '2x1';

let OUTPUT_WIDTH  = 1920;
let OUTPUT_HEIGHT = 1080;

let DISP_WIDTH  = 900;
let DISP_HEIGHT = 506;
let DISP_SCALE  = 1;

// Frame data array
let frames = [];

// Per-frame interaction state
let selectedFrameId = null;
let _dragState      = null; // { frameId, startMouseX, startMouseY, startLeft, startTop }

// ─── Settings ────────────────────────────────────────────────────────────────

function getSettings() {
  return {
    innerGap:     parseInt(document.getElementById('innerGapSize').value) || 0,
    bgColor:      document.getElementById('bgColor').value                || '#ffffff',
    borderColor:  document.getElementById('borderColor').value            || '#cccccc',
    borderWidth:  parseInt(document.getElementById('borderWidth').value)  || 0,
    cornerRadius: parseInt(document.getElementById('cornerRadius').value) || 0,
  };
}

// ─── Initialization ──────────────────────────────────────────────────────────

function initCollage() {
  canvas = new fabric.Canvas('c', {
    selection:           false,
    renderOnAddRemove:   true,
    stateful:            false,
    enableRetinaScaling: false,
  });

  buildPresetButtons();
  setPreset('2x1');
  resizeCanvas();
  setupCanvasInteraction();

  window.addEventListener('resize', resizeCanvas);
  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(document.getElementById('controls'));

  updateStatus('Layout wählen und auf ein Feld klicken, um ein Bild zu laden.', 'info');
}

// ─── Canvas interaction (wheel zoom + drag — all on canvas level) ─────────────

function setupCanvasInteraction() {
  // Wheel zoom: zoom image inside the frame under the cursor
  canvas.on('mouse:wheel', (opt) => {
    opt.e.preventDefault();
    opt.e.stopPropagation();
    const pointer = canvas.getPointer(opt.e);
    const frame   = getFrameAtPoint(pointer.x, pointer.y);
    if (!frame || !frame.imageObj) return;
    selectFrame(frame.frameId);
    const factor = opt.e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomFrameImage(frame, factor, pointer);
  });

  // Mouse down: start drag or handle double-click reset
  canvas.on('mouse:down', (opt) => {
    if (opt.e.button !== 0) return;
    const pointer = canvas.getPointer(opt.e);
    const frame   = getFrameAtPoint(pointer.x, pointer.y);
    if (!frame) return;

    selectFrame(frame.frameId);
    if (!frame.imageObj) return; // placeholder handles its own click via object event

    if (opt.e.detail === 2) {
      // Double-click: reset to cover-fit
      fitImageToFrame(frame);
      updateZoomUI();
      return;
    }

    _dragState = {
      frameId:     frame.frameId,
      startMouseX: opt.e.clientX,
      startMouseY: opt.e.clientY,
      startLeft:   frame.imageObj.left,
      startTop:    frame.imageObj.top,
    };
    canvas.defaultCursor = 'grabbing';
  });

  // Mouse move: pan the image
  canvas.on('mouse:move', (opt) => {
    if (!_dragState) return;
    const frame = frames.find(f => f.frameId === _dragState.frameId);
    if (!frame || !frame.imageObj) { _dragState = null; return; }

    const dx = opt.e.clientX - _dragState.startMouseX;
    const dy = opt.e.clientY - _dragState.startMouseY;

    frame.imageObj.set({
      left: clampImagePosition(_dragState.startLeft + dx, frame.imageObj.getScaledWidth(),  frame.dispX, frame.dispW),
      top:  clampImagePosition(_dragState.startTop  + dy, frame.imageObj.getScaledHeight(), frame.dispY, frame.dispH),
    });
    canvas.renderAll();
  });

  canvas.on('mouse:up', () => {
    if (_dragState) {
      _dragState = null;
      canvas.defaultCursor = 'default';
    }
  });
}

// ─── Frame zoom helpers ───────────────────────────────────────────────────────

function getFrameAtPoint(x, y) {
  return frames.find(f =>
    x >= f.dispX && x <= f.dispX + f.dispW &&
    y >= f.dispY && y <= f.dispY + f.dispH
  ) || null;
}

/**
 * Zoom the image inside a frame by `factor`, centered on `point` (canvas coords).
 * Minimum scale = cover scale (image always fills the frame).
 */
function zoomFrameImage(frame, factor, point) {
  const img = frame.imageObj;
  if (!img) return;

  const coverScale = img._coverScale || Math.max(frame.dispW / img.width, frame.dispH / img.height);
  const newScale   = Math.max(img.scaleX * factor, coverScale);
  const ratio      = newScale / img.scaleX;

  const px = point ? point.x : frame.dispX + frame.dispW / 2;
  const py = point ? point.y : frame.dispY + frame.dispH / 2;

  img.set({
    scaleX: newScale,
    scaleY: newScale,
    left:   clampImagePosition(px - (px - img.left) * ratio, img.width  * newScale, frame.dispX, frame.dispW),
    top:    clampImagePosition(py - (py - img.top)  * ratio, img.height * newScale, frame.dispY, frame.dispH),
  });
  canvas.renderAll();
  updateZoomUI();
}

// ─── Frame selection & zoom UI ────────────────────────────────────────────────

function selectFrame(frameId) {
  selectedFrameId = frameId;
  updateZoomUI();
}

function getSelectedFrame() {
  return frames.find(f => f.frameId === selectedFrameId) || null;
}

function updateZoomUI() {
  const row        = document.getElementById('zoom-row');
  const frameLabel = document.getElementById('zoomFrameLabel');
  const zoomLabel  = document.getElementById('zoomLabel');
  const zoomInput  = document.getElementById('zoomInput');
  if (!row) return;

  const frame = getSelectedFrame();

  if (!frame || !frame.imageObj) {
    row.classList.add('no-image');
    if (frameLabel) frameLabel.textContent = frame
      ? `Feld (${frame.row + 1}/${frame.col + 1}) — kein Bild`
      : 'Kein Feld ausgewählt';
    if (zoomLabel)  zoomLabel.textContent  = '—';
    if (zoomInput)  zoomInput.value        = 100;
    return;
  }

  row.classList.remove('no-image');
  const coverScale = frame.imageObj._coverScale || 1;
  const pct = Math.round(frame.imageObj.scaleX / coverScale * 100);
  if (frameLabel) frameLabel.textContent = `Feld Z${frame.row + 1} / S${frame.col + 1}`;
  if (zoomLabel)  zoomLabel.textContent  = pct + '%';
  if (zoomInput)  zoomInput.value        = pct;
}

function zoomSelectedIn()    { const f = getSelectedFrame(); if (f && f.imageObj) zoomFrameImage(f, 1.01); }
function zoomSelectedOut()   { const f = getSelectedFrame(); if (f && f.imageObj) zoomFrameImage(f, 1 / 1.01); }
function zoomSelectedReset() { const f = getSelectedFrame(); if (f && f.imageObj) { fitImageToFrame(f); updateZoomUI(); } }

function applyZoomInput() {
  const frame = getSelectedFrame();
  if (!frame || !frame.imageObj) return;
  const pct = parseInt(document.getElementById('zoomInput').value);
  if (!pct || pct < 100) return;
  const coverScale = frame.imageObj._coverScale || Math.max(frame.dispW / frame.imageObj.width, frame.dispH / frame.imageObj.height);
  const targetScale = coverScale * pct / 100;
  const ratio = targetScale / frame.imageObj.scaleX;
  const cx = frame.dispX + frame.dispW / 2;
  const cy = frame.dispY + frame.dispH / 2;
  frame.imageObj.set({
    scaleX: targetScale,
    scaleY: targetScale,
    left: clampImagePosition(cx - (cx - frame.imageObj.left) * ratio, frame.imageObj.width  * targetScale, frame.dispX, frame.dispW),
    top:  clampImagePosition(cy - (cy - frame.imageObj.top)  * ratio, frame.imageObj.height * targetScale, frame.dispY, frame.dispH),
  });
  canvas.renderAll();
  updateZoomUI();
}

// ─── Preset UI ───────────────────────────────────────────────────────────────

function buildPresetButtons() {
  const grid = document.getElementById('presetGrid');
  grid.innerHTML = '';

  PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (p.id === currentPresetId ? ' active' : '');
    btn.dataset.id = p.id;
    btn.title = `${p.cols} Spalte${p.cols > 1 ? 'n' : ''} × ${p.rows} Zeile${p.rows > 1 ? 'n' : ''}`;
    btn.onclick = () => setPreset(p.id);

    const icon = document.createElement('div');
    icon.className = 'preset-icon';
    icon.style.gridTemplateColumns = `repeat(${p.cols}, 1fr)`;
    icon.style.gridTemplateRows    = `repeat(${p.rows}, 1fr)`;
    for (let i = 0; i < p.cols * p.rows; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      icon.appendChild(cell);
    }

    const lbl = document.createElement('span');
    lbl.textContent = p.label;

    btn.appendChild(icon);
    btn.appendChild(lbl);
    grid.appendChild(btn);
  });
}

function setPreset(id) {
  const p = PRESETS.find(x => x.id === id);
  if (!p) return;
  currentLayout   = { cols: p.cols, rows: p.rows };
  currentPresetId = id;

  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });

  rebuildFrames();
}

// ─── Canvas / Output size ────────────────────────────────────────────────────

function onCanvasSizeChange() {
  const val = document.getElementById('canvasSize').value;
  const customControls = document.getElementById('customSizeControls');

  if (val === 'custom') {
    customControls.classList.remove('hidden');
    return;
  }
  customControls.classList.add('hidden');

  const [w, h] = val.split('x').map(Number);
  OUTPUT_WIDTH  = w;
  OUTPUT_HEIGHT = h;
  resizeCanvas();
  rebuildFrames();
}

function applyCustomSize() {
  const w = parseInt(document.getElementById('customW').value);
  const h = parseInt(document.getElementById('customH').value);
  if (!w || !h || w < 200 || h < 200) { updateStatus('Ungültige Größe', 'error'); return; }
  OUTPUT_WIDTH  = w;
  OUTPUT_HEIGHT = h;
  document.getElementById('customSizeControls').classList.add('hidden');
  document.getElementById('canvasSize').value = 'custom';
  resizeCanvas();
  rebuildFrames();
}

function resizeCanvas() {
  if (!canvas) return;

  const controls  = document.getElementById('controls');
  const MARGIN    = 24;
  const controlsH = controls ? controls.offsetHeight : 0;

  const availH = window.innerHeight - controlsH - MARGIN * 3 - 30;
  const availW = window.innerWidth  - MARGIN * 2;
  const ar     = OUTPUT_WIDTH / OUTPUT_HEIGHT;

  DISP_WIDTH  = Math.floor(Math.min(availW, availH * ar, OUTPUT_WIDTH, 1400));
  DISP_HEIGHT = Math.round(DISP_WIDTH / ar);
  DISP_SCALE  = DISP_WIDTH / OUTPUT_WIDTH;

  canvas.setWidth(DISP_WIDTH);
  canvas.setHeight(DISP_HEIGHT);

  const container = document.getElementById('canvas-container');
  if (container) {
    container.style.width  = DISP_WIDTH  + 'px';
    container.style.height = DISP_HEIGHT + 'px';
  }

  layoutFrames();
  canvas.renderAll();
}

// ─── Frame management ────────────────────────────────────────────────────────

/**
 * Save image zoom/pan state relative to each frame before any rebuild.
 * Returns { frameId: { img, offsetX, offsetY, scale, coverScale } }
 */
function captureImageStates() {
  const states = {};
  frames.forEach(f => {
    if (f.imageObj) {
      states[f.frameId] = {
        img:        f.imageObj,
        offsetX:    f.imageObj.left - f.dispX,
        offsetY:    f.imageObj.top  - f.dispY,
        scale:      f.imageObj.scaleX,
        coverScale: f.imageObj._coverScale || Math.max(f.dispW / f.imageObj.width, f.dispH / f.imageObj.height),
      };
    }
  });
  return states;
}

/**
 * Rebuild frames from scratch (layout/settings/output-size changed).
 * Preserves all image zoom/pan states.
 */
function rebuildFrames() {
  const savedStates = captureImageStates();

  canvas.clear();
  frames = [];

  drawBackground();
  buildFrameObjects();
  restoreImageStates(savedStates);
  canvas.renderAll();
  updateZoomUI();
}

/**
 * Re-position frames after display-size change (window resize).
 * Preserves all image zoom/pan states.
 */
function layoutFrames() {
  if (frames.length === 0) {
    drawBackground();
    buildFrameObjects();
    return;
  }

  const savedStates = captureImageStates();

  const s = getSettings();
  const { cols, rows } = currentLayout;
  const bw = s.borderWidth;
  const ig = s.innerGap;
  const totalGapW = ig * (cols - 1) + bw * 2;
  const totalGapH = ig * (rows - 1) + bw * 2;
  const cellW = (DISP_WIDTH  - totalGapW) / cols;
  const cellH = (DISP_HEIGHT - totalGapH) / rows;

  frames.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = bw + col * (cellW + ig);
    const y   = bw + row * (cellH + ig);

    f.dispX = x; f.dispY = y; f.dispW = cellW; f.dispH = cellH;

    if (f.placeholderRect) {
      f.placeholderRect.set({ left: x, top: y, width: cellW, height: cellH,
        rx: s.cornerRadius, ry: s.cornerRadius });
    }
    if (f.labelObj) {
      f.labelObj.set({ left: x + cellW / 2, top: y + cellH / 2,
        fontSize: Math.min(cellW, cellH) * 0.3 });
    }
    if (f.clipRect) {
      f.clipRect.set({ left: x, top: y, width: cellW, height: cellH,
        rx: s.cornerRadius, ry: s.cornerRadius, absolutePositioned: true });
    }

    if (f.imageObj) applyImageState(f, savedStates[f.frameId]);
  });

  canvas.getObjects().filter(o => o.isBackground).forEach(o => canvas.remove(o));
  drawBackground();
  updateZoomUI();
}

/**
 * Restore saved zoom/pan state onto `frame`, adjusting for new frame size.
 * Maintains relative zoom (ratio over cover) and pan offset.
 */
function applyImageState(frame, state) {
  const img = frame.imageObj;
  if (!img || !state) { fitImageToFrame(frame); return; }

  const newCoverScale = Math.max(frame.dispW / img.width, frame.dispH / img.height);
  const relZoom       = state.scale / state.coverScale;               // user-applied zoom ratio
  const newScale      = Math.max(newCoverScale * relZoom, newCoverScale);

  let newLeft = frame.dispX + state.offsetX;
  let newTop  = frame.dispY + state.offsetY;
  newLeft = clampImagePosition(newLeft, img.width  * newScale, frame.dispX, frame.dispW);
  newTop  = clampImagePosition(newTop,  img.height * newScale, frame.dispY, frame.dispH);

  frame.clipRect.set({ left: frame.dispX, top: frame.dispY,
    width: frame.dispW, height: frame.dispH, absolutePositioned: true });

  img.set({ left: newLeft, top: newTop, scaleX: newScale, scaleY: newScale,
    _coverScale: newCoverScale, clipPath: frame.clipRect });
}

/**
 * Restore images to rebuilt frames using saved states.
 */
function restoreImageStates(savedStates) {
  Object.entries(savedStates).forEach(([frameId, state]) => {
    const frame = frames.find(f => f.frameId === frameId);
    if (!frame) return;

    if (frame.placeholderRect) { canvas.remove(frame.placeholderRect); frame.placeholderRect = null; }
    if (frame.labelObj)        { canvas.remove(frame.labelObj);        frame.labelObj = null; }

    applyImageState(frame, state);

    frame.imageObj = state.img;
    canvas.add(state.img);
  });
}

function drawBackground() {
  const s  = getSettings();
  const bw = s.borderWidth;

  // Layer 1 (bottom): outer frame color — visible only at canvas edges when borderWidth > 0
  const outerBg = new fabric.Rect({
    left: 0, top: 0, width: DISP_WIDTH, height: DISP_HEIGHT,
    fill: bw > 0 ? s.borderColor : s.bgColor,
    selectable: false, evented: false, isBackground: true,
  });
  canvas.insertAt(outerBg, 0);

  // Layer 2: inner background fills the cell area with bgColor (gap color between images)
  if (bw > 0) {
    const innerBg = new fabric.Rect({
      left: bw, top: bw, width: DISP_WIDTH - bw * 2, height: DISP_HEIGHT - bw * 2,
      fill: s.bgColor,
      selectable: false, evented: false, isBackground: true,
    });
    canvas.insertAt(innerBg, 1);
  }
}

function buildFrameObjects() {
  const s = getSettings();
  const { cols, rows } = currentLayout;
  const bw = s.borderWidth;
  const ig = s.innerGap;
  const totalGapW = ig * (cols - 1) + bw * 2;
  const totalGapH = ig * (rows - 1) + bw * 2;
  const cellW = (DISP_WIDTH  - totalGapW) / cols;
  const cellH = (DISP_HEIGHT - totalGapH) / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const frameId = `frame_${row}_${col}`;
      const x = bw + col * (cellW + ig);
      const y = bw + row * (cellH + ig);

      const placeholder = new fabric.Rect({
        left: x, top: y, width: cellW, height: cellH,
        fill: '#d0d0d0', stroke: '#bbb', strokeWidth: 1,
        rx: s.cornerRadius, ry: s.cornerRadius,
        selectable: false, evented: true, frameId,
      });
      placeholder.on('mousedown', () => openImageForFrame(frameId));
      canvas.add(placeholder);

      const label = new fabric.Text('+', {
        left: x + cellW / 2, top: y + cellH / 2,
        originX: 'center', originY: 'center',
        fontSize: Math.min(cellW, cellH) * 0.3,
        fill: '#aaa', selectable: false, evented: false, isLabel: true,
      });
      canvas.add(label);

      const clipRect = new fabric.Rect({
        left: x, top: y, width: cellW, height: cellH,
        rx: s.cornerRadius, ry: s.cornerRadius, absolutePositioned: true,
      });

      frames.push({
        frameId, col, row,
        dispX: x, dispY: y, dispW: cellW, dispH: cellH,
        placeholderRect: placeholder,
        clipRect, imageObj: null, labelObj: label,
      });
    }
  }
}

// ─── Settings live update ────────────────────────────────────────────────────

function onSettingsChange() {
  rebuildFrames();
}

// ─── Status ──────────────────────────────────────────────────────────────────

function updateStatus(message, type = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = message;
  el.className = { success: 'status-success', error: 'status-error', info: 'status-info' }[type] ?? '';
}

// ─── Clear ───────────────────────────────────────────────────────────────────

function clearAll() {
  frames.forEach(f => { f.imageObj = null; });
  selectedFrameId = null;
  rebuildFrames();
  updateStatus('Alle Bilder entfernt.', 'info');
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initCollage);
