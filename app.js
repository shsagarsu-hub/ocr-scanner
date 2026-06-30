// ===== CONFIG =====
// Paste your Apps Script web app deployment URL here after setup.
const API_URL = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';

// ===== ELEMENTS =====
const video = document.getElementById('video');
const captureCanvas = document.getElementById('capture-canvas');
const capturedPreview = document.getElementById('captured-preview');
const cropStage = document.getElementById('crop-stage');
const cropImage = document.getElementById('crop-image');
const cropBox = document.getElementById('crop-box');
const cropControls = document.getElementById('crop-controls');
const cropCancelBtn = document.getElementById('crop-cancel-btn');
const cropConfirmBtn = document.getElementById('crop-confirm-btn');
const shutterBtn = document.getElementById('shutter');
const controls = document.getElementById('controls');
const cameraView = document.getElementById('camera-view');
const resultPanel = document.getElementById('result-panel');
const ocrTextEl = document.getElementById('ocr-text');
const confidenceBadge = document.getElementById('confidence-badge');
const sendBtn = document.getElementById('send-btn');
const retakeBtn = document.getElementById('retake-btn');
const recropBtn = document.getElementById('recrop-btn');
const sendStatus = document.getElementById('send-status');
const statusPill = document.getElementById('status-pill');
const overlayMsg = document.getElementById('overlay-msg');
const ocrProgress = document.getElementById('ocr-progress');
const progressPct = document.getElementById('progress-pct');
const progressLabel = document.getElementById('progress-label');

let stream = null;
let lastImageDataUrl = null;
let lastConfidence = null;
let fullResCanvas = null; // the un-cropped capture, kept for crop math
let appendMode = false; // true when adding another cropped field to existing text

// ===== CAMERA SETUP =====
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = stream;
    statusPill.textContent = 'ready';
  } catch (err) {
    statusPill.textContent = 'camera blocked';
    showOverlay('Camera access denied. Enable camera permission and reload.', true);
    console.error(err);
  }
}

function showOverlay(msg, persistent) {
  overlayMsg.textContent = msg;
  overlayMsg.classList.remove('hidden');
  if (!persistent) {
    setTimeout(() => overlayMsg.classList.add('hidden'), 2500);
  }
}

// ===== CAPTURE =====
shutterBtn.addEventListener('click', () => {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    showOverlay('Camera not ready yet, try again.');
    return;
  }

  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const rawDataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);

  fullResCanvas = document.createElement('canvas');
  fullResCanvas.width = w;
  fullResCanvas.height = h;
  fullResCanvas.getContext('2d').drawImage(captureCanvas, 0, 0);

  video.style.display = 'none';
  controls.classList.add('hidden');
  showCropStage(rawDataUrl);
});

// ===== CROP STAGE =====
function showCropStage(dataUrl) {
  cropImage.src = dataUrl;
  cropStage.style.display = 'block';
  cropControls.style.display = 'flex';
  cropCancelBtn.textContent = appendMode ? 'Cancel' : 'Retake photo';

  // Default box: centered, covering the middle 70% width / 35% height —
  // a reasonable starting size for a single line/label, user adjusts from there.
  cropImage.onload = () => {
    const rect = cropImage.getBoundingClientRect();
    const boxW = rect.width * 0.7;
    const boxH = rect.height * 0.35;
    setCropBoxRect({
      left: (rect.width - boxW) / 2,
      top: (rect.height - boxH) / 2,
      width: boxW,
      height: boxH
    });
  };
}

function setCropBoxRect(r) {
  cropBox.style.left = r.left + 'px';
  cropBox.style.top = r.top + 'px';
  cropBox.style.width = r.width + 'px';
  cropBox.style.height = r.height + 'px';
}

function getCropBoxRect() {
  return {
    left: cropBox.offsetLeft,
    top: cropBox.offsetTop,
    width: cropBox.offsetWidth,
    height: cropBox.offsetHeight
  };
}

// Dragging the whole box to reposition it
let dragState = null;

cropBox.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('crop-handle')) return; // handled separately
  dragState = { type: 'move', startX: e.clientX, startY: e.clientY, start: getCropBoxRect() };
  cropBox.setPointerCapture(e.pointerId);
});

document.querySelectorAll('.crop-handle').forEach((handle) => {
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dragState = {
      type: 'resize',
      corner: [...handle.classList].find((c) => c !== 'crop-handle'),
      startX: e.clientX,
      startY: e.clientY,
      start: getCropBoxRect()
    };
    handle.setPointerCapture(e.pointerId);
  });
});

document.addEventListener('pointermove', (e) => {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const stageRect = cropStage.getBoundingClientRect();
  const minSize = 40;

  if (dragState.type === 'move') {
    let left = dragState.start.left + dx;
    let top = dragState.start.top + dy;
    left = Math.max(0, Math.min(left, stageRect.width - dragState.start.width));
    top = Math.max(0, Math.min(top, stageRect.height - dragState.start.height));
    setCropBoxRect({ left, top, width: dragState.start.width, height: dragState.start.height });
  } else if (dragState.type === 'resize') {
    let { left, top, width, height } = dragState.start;
    if (dragState.corner.includes('r')) width = Math.max(minSize, dragState.start.width + dx);
    if (dragState.corner.includes('l')) {
      width = Math.max(minSize, dragState.start.width - dx);
      left = dragState.start.left + dragState.start.width - width;
    }
    if (dragState.corner.includes('b')) height = Math.max(minSize, dragState.start.height + dy);
    if (dragState.corner.startsWith('t')) {
      height = Math.max(minSize, dragState.start.height - dy);
      top = dragState.start.top + dragState.start.height - height;
    }
    left = Math.max(0, left);
    top = Math.max(0, top);
    width = Math.min(width, stageRect.width - left);
    height = Math.min(height, stageRect.height - top);
    setCropBoxRect({ left, top, width, height });
  }
});

document.addEventListener('pointerup', () => { dragState = null; });

cropCancelBtn.addEventListener('click', () => {
  cropStage.style.display = 'none';
  cropControls.style.display = 'none';
  if (appendMode) {
    appendMode = false;
    cameraView.style.display = 'none';
    resultPanel.style.display = 'flex';
  } else {
    video.style.display = 'block';
    controls.classList.remove('hidden');
  }
});

cropConfirmBtn.addEventListener('click', () => {
  const imgRect = cropImage.getBoundingClientRect();
  const boxRect = getCropBoxRect();

  // Map the displayed (object-fit: contain) box back to actual pixel
  // coordinates on the full-resolution captured canvas.
  const scaleX = fullResCanvas.width / imgRect.width;
  const scaleY = fullResCanvas.height / imgRect.height;

  const sx = boxRect.left * scaleX;
  const sy = boxRect.top * scaleY;
  const sw = boxRect.width * scaleX;
  const sh = boxRect.height * scaleY;

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = sw;
  croppedCanvas.height = sh;
  croppedCanvas.getContext('2d').drawImage(fullResCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const croppedDataUrl = croppedCanvas.toDataURL('image/jpeg', 0.95);
  capturedPreview.src = croppedDataUrl;
  capturedPreview.style.display = 'block';

  cropStage.style.display = 'none';
  cropControls.style.display = 'none';

  const processedDataUrl = preprocessForOcr(croppedCanvas);
  lastImageDataUrl = processedDataUrl;
  runOcr(processedDataUrl);
});

// ===== IMAGE PREPROCESSING =====
// Tesseract reads best on a high-contrast, upscaled, grayscale image.
// Raw phone photos of small print are usually too low-contrast and too
// small (in character-pixel-height terms) for it, even if they look fine
// to a human eye. This step compensates for that.
function preprocessForOcr(sourceCanvas) {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  // Upscale small-print captures so character height is large enough
  // for Tesseract to resolve detail (target ~2500px on the long edge).
  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge < 2500 ? 2500 / longEdge : 1;
  const outW = Math.round(srcW * scale);
  const outH = Math.round(srcH * scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const ctx = outCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, outW, outH);

  // Grayscale + contrast stretch (normalize the histogram so faint print
  // becomes much darker relative to the background).
  const imageData = ctx.getImageData(0, 0, outW, outH);
  const data = imageData.data;
  const grays = new Uint8ClampedArray(outW * outH);

  let min = 255, max = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grays[p] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = Math.max(max - min, 1);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Stretch contrast across the full 0-255 range, then push it a bit
    // further with a mild S-curve so text edges sharpen.
    let v = ((grays[p] - min) / range) * 255;
    v = v < 128
      ? Math.max(0, v - (128 - v) * 0.15)
      : Math.min(255, v + (v - 128) * 0.15);
    data[i] = data[i + 1] = data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return outCanvas.toDataURL('image/jpeg', 0.95);
}

// ===== OCR =====
async function runOcr(imageDataUrl) {
  ocrProgress.style.display = 'flex';
  progressPct.textContent = '0%';
  progressLabel.textContent = 'Reading text…';

  try {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          progressPct.textContent = pct + '%';
        } else {
          progressLabel.textContent = humanizeStatus(m.status);
        }
      },
      // PSM 11 ("sparse text") works better than the default for labels,
      // spec sheets, and other layouts that aren't a flowing paragraph.
      tessedit_pageseg_mode: '11'
    });

    const text = result.data.text.trim();
    const confidence = result.data.confidence;
    lastConfidence = confidence;

    ocrProgress.style.display = 'none';
    showResult(text, confidence);
  } catch (err) {
    ocrProgress.style.display = 'none';
    console.error(err);
    showOverlay('OCR failed. Try retaking the photo.', true);
    resetToCamera();
  }
}

function humanizeStatus(status) {
  const map = {
    'loading tesseract core': 'Loading OCR engine…',
    'initializing tesseract': 'Initializing…',
    'loading language traineddata': 'Loading language data…',
    'initializing api': 'Preparing…',
    'recognizing text': 'Reading text…'
  };
  return map[status] || 'Processing…';
}

// ===== SHOW RESULT =====
function showResult(text, confidence) {
  cameraView.style.display = 'none';
  resultPanel.style.display = 'flex';

  if (appendMode && ocrTextEl.value.trim()) {
    ocrTextEl.value = ocrTextEl.value.trim() + '\n' + (text || '');
  } else {
    ocrTextEl.value = text || '';
  }
  appendMode = false;

  if (!text) {
    sendStatus.textContent = 'No text detected — move closer so the print fills the frame, and retake.';
    sendStatus.style.color = 'var(--red)';
    sendBtn.disabled = true;
  } else if (confidence < 50) {
    sendStatus.textContent = 'Low confidence — for small print, fill the frame with just the text and avoid glare, then retake.';
    sendStatus.style.color = 'var(--red)';
    sendBtn.disabled = false;
  } else {
    sendStatus.textContent = '';
    sendBtn.disabled = false;
  }

  confidenceBadge.textContent = `${Math.round(confidence)}% confidence`;
  confidenceBadge.style.background = confidence >= 70
    ? 'rgba(58,107,74,0.15)'
    : 'rgba(168,51,31,0.15)';
  confidenceBadge.style.color = confidence >= 70 ? 'var(--green)' : 'var(--red)';
}

// ===== RETAKE =====
retakeBtn.addEventListener('click', resetToCamera);

// ===== RECROP (read another field from the same photo) =====
recropBtn.addEventListener('click', () => {
  if (!fullResCanvas) return;
  appendMode = true;
  resultPanel.style.display = 'none';
  cameraView.style.display = 'block';
  showCropStage(fullResCanvas.toDataURL('image/jpeg', 0.95));
});

function resetToCamera() {
  resultPanel.style.display = 'none';
  cameraView.style.display = 'block';
  video.style.display = 'block';
  capturedPreview.style.display = 'none';
  cropStage.style.display = 'none';
  cropControls.style.display = 'none';
  controls.classList.remove('hidden');
  sendStatus.textContent = '';
  ocrTextEl.value = '';
  appendMode = false;
  fullResCanvas = null;
}

// ===== SEND =====
sendBtn.addEventListener('click', async () => {
  const text = ocrTextEl.value.trim();
  if (!text) return;

  if (API_URL.includes('PASTE_YOUR')) {
    sendStatus.textContent = 'Backend not configured yet — see setup instructions.';
    sendStatus.style.color = 'var(--red)';
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  sendStatus.textContent = '';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // avoids CORS preflight to Apps Script
      body: JSON.stringify({
        text,
        confidence: lastConfidence,
        timestamp: new Date().toISOString()
      })
    });

    const data = await res.json();

    if (data.ok) {
      sendStatus.textContent = 'Sent to your email.';
      sendStatus.style.color = 'var(--green)';
      setTimeout(resetToCamera, 1400);
    } else {
      sendStatus.textContent = 'Send failed: ' + (data.error || 'unknown error');
      sendStatus.style.color = 'var(--red)';
    }
  } catch (err) {
    console.error(err);
    sendStatus.textContent = 'Network error — check your connection and try again.';
    sendStatus.style.color = 'var(--red)';
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send to email';
  }
});

// ===== INIT =====
startCamera();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  });
}
