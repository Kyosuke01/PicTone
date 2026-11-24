/* ==========================================================================
   PicTone — affichage : zoom, déplacement, rotation d'aperçu, comparaison,
   outils de dessin (sur le calque actif) et recadrage.
   ========================================================================== */

const viewport       = document.getElementById('viewport');
const stageWrap      = document.getElementById('stage-wrap');
const stageCanvas    = document.getElementById('stage-canvas');
const stageBefore    = document.getElementById('stage-before');
const compareHandle  = document.getElementById('compare-handle');
const brushCursor    = document.getElementById('brush-cursor');
const editorEl       = document.getElementById('editor');
const emptyStateEl   = document.getElementById('empty-state');
const zoomLabel      = document.getElementById('zoom-label');
const cropOverlay    = document.getElementById('crop-overlay');
const cropSelection  = document.getElementById('crop-selection');
const cropToolbar    = document.getElementById('crop-toolbar');
const tabEditBtn     = document.getElementById('tab-edit');
const tabSplitBtn    = document.getElementById('tab-split');

const MAX_PREVIEW = 2048;   // taille maximale du rendu à l'écran (au-delà, on réduit)
let zoom = 1;               // zoom relatif à « ajuster à la fenêtre »
let panX = 0, panY = 0;     // déplacement en pixels écran
let rotation = 0;           // rotation d'aperçu (degrés), appliquée à l'export
let splitView = false;      // comparaison Avant / Après
let splitPct = 50;          // position de la séparation (%)
let isCropping = false;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };  // en pixels du document
let cropDrag = null;        // { mode, startDoc, startRect }
let renderQueued = false;

// Échelle d'affichage : pixels écran par pixel du document.
function fitScale() {
    if (!hasDoc()) return 1;
    const r = viewport.getBoundingClientRect();
    const availW = Math.max(60, r.width - 48);
    const availH = Math.max(60, r.height - 48);
    return Math.min(availW / doc.w, availH / doc.h);
}

function displayScale() {
    return fitScale() * zoom;
}

// Résolution du rendu (canevas) : doc.w réduit si trop grand.
function previewSize() {
    const k = Math.min(1, MAX_PREVIEW / Math.max(doc.w, doc.h));
    return { w: Math.max(1, Math.round(doc.w * k)), h: Math.max(1, Math.round(doc.h * k)) };
}

function applyViewTransform() {
    if (!hasDoc()) return;
    const ds = displayScale();
    const w = doc.w * ds, h = doc.h * ds;
    stageWrap.style.width = `${w}px`;
    stageWrap.style.height = `${h}px`;
    stageWrap.style.transform = `translate(${panX}px, ${panY}px) rotate(${isCropping ? 0 : rotation}deg)`;
    for (const c of [stageCanvas, stageBefore]) {
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
    }
    zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
    if (isCropping) updateCropOverlay();
}

// Redessine le rendu (planifié : une fois par image, pendant les glissements).
function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        renderView();
    });
}

function renderView() {
    if (!hasDoc()) return;
    const { w, h } = previewSize();
    if (stageCanvas.width !== w || stageCanvas.height !== h) {
        stageCanvas.width = w;
        stageCanvas.height = h;
        stageBefore.width = w;
        stageBefore.height = h;
    }
    const after = renderComposite(w, h, true);
    const ctxA = stageCanvas.getContext('2d');
    ctxA.clearRect(0, 0, w, h);
    ctxA.drawImage(after, 0, 0);

    if (splitView) {
        const before = renderComposite(w, h, false);
        const ctxB = stageBefore.getContext('2d');
        ctxB.clearRect(0, 0, w, h);
        ctxB.drawImage(before, 0, 0);
        stageBefore.style.clipPath = `inset(0 ${100 - splitPct}% 0 0)`;
    }
    stageBefore.classList.toggle('hidden', !splitView);
    compareHandle.classList.toggle('hidden', !splitView);
    compareHandle.style.left = `${splitPct}%`;
    applyViewTransform();
}

// Zoom autour d'un point écran (le point reste sous le curseur).
function setZoom(newZoom, clientX, clientY) {
    if (!hasDoc()) return;
    const clamped = Math.max(0.1, Math.min(8, newZoom));
    if (clientX !== undefined) {
        const r = viewport.getBoundingClientRect();
        const px = clientX - (r.left + r.width / 2);
        const py = clientY - (r.top + r.height / 2);
        const ratio = clamped / zoom;
        panX = px - (px - panX) * ratio;
        panY = py - (py - panY) * ratio;
    }
    zoom = clamped;
    applyViewTransform();
    updateCursorSize();
}

function zoomFit() {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyViewTransform();
    updateCursorSize();
}

function zoomActual() {
    // 100 % : un pixel du document = un pixel écran.
    zoom = 1 / fitScale();
    panX = 0;
    panY = 0;
    applyViewTransform();
    updateCursorSize();
}

// Position d'un point écran dans le document (en tenant compte du déplacement et de la rotation).
function screenToDoc(clientX, clientY) {
    const r = stageWrap.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const rad = (-(isCropping ? 0 : rotation) * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    const ds = displayScale();
    return { x: rx / ds + doc.w / 2, y: ry / ds + doc.h / 2 };
}

function updateCursorSize() {
    if (!brushCursor) return;
    const d = brushDiameterScreen();
    brushCursor.style.width = `${d}px`;
    brushCursor.style.height = `${d}px`;
}

// ---------------------------------------------------------------------------
// Déplacement et zoom à la souris / au trackpad
// ---------------------------------------------------------------------------

let panDrag = null;   // { x, y, panX, panY } pendant un déplacement à la souris
let spaceDown = false;

viewport.addEventListener('wheel', (e) => {
    if (!hasDoc()) return;
    e.preventDefault();
    if (e.ctrlKey) {
        // Pincement du trackpad (ou Ctrl + molette) : zoom centré sur le curseur.
        setZoom(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    } else {
        // Deux doigts (trackpad) ou molette : déplacement naturel sur l'image.
        panX -= e.deltaX;
        panY -= e.deltaY;
        applyViewTransform();
    }
}, { passive: false });

window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTextFieldFocused()) spaceDown = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

// ---------------------------------------------------------------------------
// Pinceau, gomme : dessin sur le calque actif
// ---------------------------------------------------------------------------

let activeBrush = 'pen';        // pen | brush | marker | eraser
let brushSize = 8;              // taille en pixels du document
let brushOpacity = 1;
let brushColor = '#e74c3c';
let stroke = null;              // tracé en cours : { layer, erase, last }

function brushDiameterScreen() {
    const size = activeBrush === 'marker' ? brushSize * 3 : activeBrush === 'brush' ? brushSize * 2 : brushSize;
    return Math.max(4, size * displayScale());
}

function drawSegment(layer, erase, from, to) {
    const ctx = layer.canvas.getContext('2d');
    ctx.save();
    if (erase) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = brushSize * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = brushOpacity;
        ctx.strokeStyle = brushColor;
        switch (activeBrush) {
            case 'brush':
                ctx.lineWidth = brushSize * 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = brushColor;
                ctx.shadowBlur = brushSize * 1.5;
                break;
            case 'marker':
                ctx.lineWidth = brushSize * 3;
                ctx.lineCap = 'square';
                ctx.lineJoin = 'bevel';
                break;
            default:
                ctx.lineWidth = brushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
        }
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
}

function moveBrushCursor(e) {
    brushCursor.style.left = `${e.clientX}px`;
    brushCursor.style.top = `${e.clientY}px`;
    brushCursor.style.display = 'block';
    brushCursor.classList.toggle('erase', activeBrush === 'eraser');
    updateCursorSize();
}

viewport.addEventListener('pointerdown', (e) => {
    if (!hasDoc() || e.target.closest('#crop-toolbar, #compare-handle')) return;
    // Espace ou bouton du milieu : déplacement de la vue
    if (spaceDown || e.button === 1) {
        panDrag = { x: e.clientX, y: e.clientY, panX, panY };
        viewport.setPointerCapture(e.pointerId);
        viewport.classList.add('panning');
        e.preventDefault();
        return;
    }
    if (isCropping) return;
    if (e.button !== 0 && e.button !== 2) return;
    const layer = activeLayer();
    if (!layer || !stageWrap.contains(e.target)) return;
    const erase = e.button === 2 || activeBrush === 'eraser';
    const p = screenToDoc(e.clientX, e.clientY);
    stroke = { layer, erase, last: p };
    drawSegment(layer, erase, p, p);
    viewport.setPointerCapture(e.pointerId);
    scheduleRender();
});

viewport.addEventListener('pointermove', (e) => {
    if (panDrag) {
        panX = panDrag.panX + (e.clientX - panDrag.x);
        panY = panDrag.panY + (e.clientY - panDrag.y);
        applyViewTransform();
        return;
    }
    if (hasDoc() && !isCropping && stageWrap.contains(e.target)) moveBrushCursor(e);
    else brushCursor.style.display = 'none';
    if (!stroke) return;
    const p = screenToDoc(e.clientX, e.clientY);
    drawSegment(stroke.layer, stroke.erase, stroke.last, p);
    stroke.last = p;
    scheduleRender();
});

function endPointer(e) {
    if (panDrag) {
        panDrag = null;
        viewport.classList.remove('panning');
    }
    if (stroke) {
        const layer = stroke.layer;
        stroke = null;
        commitLayerPixels(layer);
    }
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('pointerleave', () => { if (!stroke) brushCursor.style.display = 'none'; });
viewport.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Comparaison Avant / Après
// ---------------------------------------------------------------------------

function setSplitView(on) {
    splitView = on;
    tabEditBtn.classList.toggle('active', !on);
    tabSplitBtn.classList.toggle('active', on);
    scheduleRender();
}

compareHandle.addEventListener('pointerdown', (e) => {
    compareHandle.setPointerCapture(e.pointerId);
    const move = (ev) => {
        const r = stageWrap.getBoundingClientRect();
        splitPct = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
        compareHandle.style.left = `${splitPct}%`;
        stageBefore.style.clipPath = `inset(0 ${100 - splitPct}% 0 0)`;
    };
    const up = () => {
        compareHandle.removeEventListener('pointermove', move);
        compareHandle.removeEventListener('pointerup', up);
    };
    compareHandle.addEventListener('pointermove', move);
    compareHandle.addEventListener('pointerup', up);
});

// ---------------------------------------------------------------------------
// Recadrage
// ---------------------------------------------------------------------------

function startCrop() {
    if (!hasDoc() || isCropping) return;
    isCropping = true;
    const mx = Math.round(doc.w * 0.1), my = Math.round(doc.h * 0.1);
    cropRect = { x: mx, y: my, w: doc.w - 2 * mx, h: doc.h - 2 * my };
    cropOverlay.classList.remove('hidden');
    cropToolbar.classList.remove('hidden');
    applyViewTransform();
    updateCropOverlay();
    onDocChanged();
}

function cancelCrop() {
    isCropping = false;
    cropOverlay.classList.add('hidden');
    cropToolbar.classList.add('hidden');
    applyViewTransform();
    onDocChanged();
}

function applyCrop() {
    if (!isCropping) return;
    const x = Math.max(0, Math.round(cropRect.x));
    const y = Math.max(0, Math.round(cropRect.y));
    const w = Math.min(doc.w - x, Math.round(cropRect.w));
    const h = Math.min(doc.h - y, Math.round(cropRect.h));
    cancelCrop();
    if (w >= 1 && h >= 1 && (w !== doc.w || h !== doc.h)) cropDocument(x, y, w, h);
}

function updateCropOverlay() {
    const ds = displayScale();
    cropSelection.style.left = `${cropRect.x * ds}px`;
    cropSelection.style.top = `${cropRect.y * ds}px`;
    cropSelection.style.width = `${cropRect.w * ds}px`;
    cropSelection.style.height = `${cropRect.h * ds}px`;
}

const MIN_CROP = 8;
cropSelection.addEventListener('pointerdown', (e) => {
    if (!isCropping) return;
    const handle = e.target.closest('[data-pos]');
    const mode = handle ? handle.dataset.pos : 'move';
    cropDrag = { mode, startDoc: screenToDoc(e.clientX, e.clientY), startRect: { ...cropRect } };
    cropSelection.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
});
cropSelection.addEventListener('pointermove', (e) => {
    if (!cropDrag) return;
    const p = screenToDoc(e.clientX, e.clientY);
    const dx = p.x - cropDrag.startDoc.x;
    const dy = p.y - cropDrag.startDoc.y;
    const s = cropDrag.startRect;
    let { x, y, w, h } = s;
    const m = cropDrag.mode;
    if (m === 'move') {
        x = Math.max(0, Math.min(doc.w - s.w, s.x + dx));
        y = Math.max(0, Math.min(doc.h - s.h, s.y + dy));
    } else {
        if (m.includes('w')) { const nx = Math.max(0, Math.min(s.x + s.w - MIN_CROP, s.x + dx)); w = s.x + s.w - nx; x = nx; }
        if (m.includes('e')) { w = Math.max(MIN_CROP, Math.min(doc.w - s.x, s.w + dx)); }
        if (m.includes('n')) { const ny = Math.max(0, Math.min(s.y + s.h - MIN_CROP, s.y + dy)); h = s.y + s.h - ny; y = ny; }
        if (m.includes('s')) { h = Math.max(MIN_CROP, Math.min(doc.h - s.y, s.h + dy)); }
    }
    cropRect = { x, y, w, h };
    updateCropOverlay();
});
cropSelection.addEventListener('pointerup', () => { cropDrag = null; });
cropSelection.addEventListener('pointercancel', () => { cropDrag = null; });

// ---------------------------------------------------------------------------
// Taille de l'espace de travail
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
    if (hasDoc()) applyViewTransform();
});
