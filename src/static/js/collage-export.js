/**
 * Image Collage Tool — Export Module
 * Exports the collage at full output resolution using an off-screen StaticCanvas.
 * The visible display canvas is NOT mutated.
 */

function downloadPNG() { exportCollage('png');  }
function downloadJPG() { exportCollage('jpeg'); }

/**
 * Render collage at OUTPUT_WIDTH × OUTPUT_HEIGHT on an off-screen StaticCanvas,
 * then trigger download.
 */
function exportCollage(format) {
  if (frames.length === 0) {
    updateStatus('Kein Layout vorhanden', 'error');
    return;
  }

  updateStatus('Exportiere…', 'info');

  const s = getSettings();
  const scale = OUTPUT_WIDTH / DISP_WIDTH; // output / display

  const exportCanvas = new fabric.StaticCanvas(null, {
    width:  OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
  });

  // Background: outer rect in borderColor, inner rect in bgColor
  const borderWOut = s.borderWidth * scale;
  const outerBg = new fabric.Rect({
    left: 0, top: 0, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT,
    fill: s.borderWidth > 0 ? s.borderColor : s.bgColor,
  });
  exportCanvas.add(outerBg);
  if (s.borderWidth > 0) {
    const innerBg = new fabric.Rect({
      left: borderWOut, top: borderWOut,
      width: OUTPUT_WIDTH - borderWOut * 2, height: OUTPUT_HEIGHT - borderWOut * 2,
      fill: s.bgColor,
    });
    exportCanvas.add(innerBg);
  }

  // For each frame, scale coords to output resolution
  const { cols, rows } = currentLayout;
  const innerGapOut = s.innerGap * scale;
  const cornerOut   = s.cornerRadius * scale;

  const totalGapW = innerGapOut * (cols - 1) + borderWOut * 2;
  const totalGapH = innerGapOut * (rows - 1) + borderWOut * 2;
  const cellW = (OUTPUT_WIDTH  - totalGapW) / cols;
  const cellH = (OUTPUT_HEIGHT - totalGapH) / rows;

  let pending = frames.length;
  let completed = 0;

  frames.forEach((frame, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = borderWOut + col * (cellW + innerGapOut);
    const y   = borderWOut + row * (cellH + innerGapOut);

    // Placeholder (gray cell for frames without an image)
    if (!frame.imageObj) {
      const ph = new fabric.Rect({
        left: x, top: y, width: cellW, height: cellH,
        fill: '#d0d0d0', stroke: '#bbb', strokeWidth: 1,
        rx: cornerOut, ry: cornerOut,
      });
      exportCanvas.add(ph);

      completed++;
      if (completed === pending) finishExport(exportCanvas, format);
      return;
    }

    // Clone image and scale to output coords
    const img = frame.imageObj;
    img.clone(cloned => {
      const outScaleX = img.scaleX * scale;
      const outScaleY = img.scaleY * scale;
      const outLeft   = x + (img.left - frame.dispX) * scale;
      const outTop    = y + (img.top  - frame.dispY) * scale;

      // Clip rect for this frame at output resolution
      const clipRect = new fabric.Rect({
        left: x, top: y, width: cellW, height: cellH,
        rx: cornerOut, ry: cornerOut,
        absolutePositioned: true,
      });

      cloned.set({
        left:    outLeft,
        top:     outTop,
        scaleX:  outScaleX,
        scaleY:  outScaleY,
        clipPath: clipRect,
        selectable: false,
      });

      exportCanvas.add(cloned);

      completed++;
      if (completed === pending) finishExport(exportCanvas, format);
    });
  });
}

function finishExport(exportCanvas, format) {
  exportCanvas.renderAll();

  const url = exportCanvas.toDataURL({ format, quality: 0.92 });
  const ext  = format === 'jpeg' ? 'jpg' : format;
  const name = `collage_${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}.${ext}`;

  const link = document.createElement('a');
  link.download = name;
  link.href     = url;
  link.click();

  exportCanvas.dispose();
  updateStatus(`Export ${OUTPUT_WIDTH}×${OUTPUT_HEIGHT}px als ${ext.toUpperCase()} abgeschlossen`, 'success');
}
