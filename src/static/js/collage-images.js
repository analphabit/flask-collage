/**
 * Image Collage Tool — Image Module
 * Handles image loading and per-frame cover-fit / reset.
 * Pan and zoom are handled at canvas level in collage-core.js.
 */

let _fileInput    = null;
let _pendingFrameId = null;

function getFileInput() {
  if (!_fileInput) {
    _fileInput = document.createElement('input');
    _fileInput.type = 'file';
    _fileInput.accept = 'image/*';
    _fileInput.style.display = 'none';
    document.body.appendChild(_fileInput);

    _fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !_pendingFrameId) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        fabric.Image.fromURL(ev.target.result, (img) => {
          if (!img) { updateStatus('Fehler beim Laden des Bildes', 'error'); return; }
          const frame = frames.find(f => f.frameId === _pendingFrameId);
          if (!frame) return;
          placeImageInFrame(frame, img);
          updateStatus(`Bild geladen (${img.width}×${img.height}px)`, 'success');
        });
      };
      reader.onerror = () => updateStatus('Fehler beim Lesen der Datei', 'error');
      reader.readAsDataURL(file);
      _fileInput.value = '';
    });
  }
  return _fileInput;
}

function openImageForFrame(frameId) {
  _pendingFrameId = frameId;
  getFileInput().click();
}

/**
 * Place (or replace) an image in a frame with cover-fit scaling.
 * Pan and zoom are handled at canvas level via setupCanvasInteraction().
 */
function placeImageInFrame(frame, img) {
  // Remove old image
  if (frame.imageObj) canvas.remove(frame.imageObj);

  // Remove placeholder and label
  if (frame.placeholderRect) { canvas.remove(frame.placeholderRect); frame.placeholderRect = null; }
  if (frame.labelObj)        { canvas.remove(frame.labelObj);        frame.labelObj = null; }

  // Cover-fit
  const coverScale = Math.max(frame.dispW / img.width, frame.dispH / img.height);
  const scaledW    = img.width  * coverScale;
  const scaledH    = img.height * coverScale;

  img.set({
    left:         frame.dispX + (frame.dispW - scaledW) / 2,
    top:          frame.dispY + (frame.dispH - scaledH) / 2,
    scaleX:       coverScale,
    scaleY:       coverScale,
    selectable:   false,
    evented:      true,
    clipPath:     frame.clipRect,
    hasControls:  false,
    hasBorders:   false,
    lockRotation: true,
    _coverScale:  coverScale,
  });

  canvas.add(img);
  frame.imageObj = img;
  canvas.renderAll();

  selectFrame(frame.frameId);
  updateZoomUI();
}

/**
 * Reset image to cover-fit (called on double-click or zoom reset button).
 */
function fitImageToFrame(frame) {
  const img = frame.imageObj;
  if (!img) return;

  const coverScale = Math.max(frame.dispW / img.width, frame.dispH / img.height);
  const scaledW    = img.width  * coverScale;
  const scaledH    = img.height * coverScale;

  frame.clipRect.set({
    left: frame.dispX, top: frame.dispY,
    width: frame.dispW, height: frame.dispH,
    absolutePositioned: true,
  });

  img.set({
    scaleX: coverScale, scaleY: coverScale,
    left:   frame.dispX + (frame.dispW - scaledW) / 2,
    top:    frame.dispY + (frame.dispH - scaledH) / 2,
    _coverScale: coverScale,
  });

  canvas.renderAll();
}

/**
 * Clamp image position so the frame is always fully covered.
 */
function clampImagePosition(pos, imgSize, framePos, frameSize) {
  const maxPos = framePos;
  const minPos = framePos + frameSize - imgSize;
  return Math.min(maxPos, Math.max(minPos, pos));
}
