// ===== CONFIG =====
// Paste your Apps Script web app deployment URL here after setup.
const API_URL = 'https://script.google.com/macros/s/AKfycbzMN8GEON7qzCHOgGWs8c4Jnv0_4oDGlJzKvjliKxl3_X8mWelBS0eCGlHD1bHqht5ecQ/exec';

// ===== ELEMENTS =====
const video = document.getElementById('video');
const captureCanvas = document.getElementById('capture-canvas');
const capturedPreview = document.getElementById('captured-preview');
const shutterBtn = document.getElementById('shutter');
const controls = document.getElementById('controls');
const cameraView = document.getElementById('camera-view');
const resultPanel = document.getElementById('result-panel');
const ocrTextEl = document.getElementById('ocr-text');
const confidenceBadge = document.getElementById('confidence-badge');
const sendBtn = document.getElementById('send-btn');
const retakeBtn = document.getElementById('retake-btn');
const sendStatus = document.getElementById('send-status');
const statusPill = document.getElementById('status-pill');
const overlayMsg = document.getElementById('overlay-msg');
const ocrProgress = document.getElementById('ocr-progress');
const progressPct = document.getElementById('progress-pct');
const progressLabel = document.getElementById('progress-label');

let stream = null;
let lastImageDataUrl = null;
let lastConfidence = null;

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
  lastImageDataUrl = captureCanvas.toDataURL('image/jpeg', 0.92);

  capturedPreview.src = lastImageDataUrl;
  capturedPreview.style.display = 'block';
  video.style.display = 'none';
  controls.classList.add('hidden');

  runOcr(lastImageDataUrl);
});

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
      }
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

  ocrTextEl.value = text || '';

  if (!text) {
    sendStatus.textContent = 'No text detected — try retaking with better lighting or framing.';
    sendStatus.style.color = 'var(--red)';
    sendBtn.disabled = true;
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

function resetToCamera() {
  resultPanel.style.display = 'none';
  cameraView.style.display = 'block';
  video.style.display = 'block';
  capturedPreview.style.display = 'none';
  controls.classList.remove('hidden');
  sendStatus.textContent = '';
  ocrTextEl.value = '';
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
