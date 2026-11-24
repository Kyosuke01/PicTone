/* ==========================================================================
   PicTone — modèle : document, calques, historique, opérations sur l'image.

   Un document = taille (w × h) + calques (du fond vers le dessus) + réglages globaux.
   Chaque calque = un canevas de la taille du document, une visibilité, une opacité
   et ses propres réglages. Tout changement de pixels passe par touch() puis commit(),
   ce qui alimente l'historique (annuler / rétablir) et le marqueur « non enregistré ».
   ========================================================================== */

const doc = {
    w: 0,
    h: 0,
    name: 'image',
    layers: [],          // du fond vers le dessus
    activeId: null,
    globals: defaultSettings(), // réglages de l'image entière (appliqués après fusion des calques)
};

let layerSeq = 0;       // identifiants de calques
let versionSeq = 0;     // versions de pixels (unique à chaque modification)
let target = 'image';   // cible des réglages du panneau Filtres : 'image' | 'layer'

// Appelé à chaque changement (rendu et interface). Défini par ui.js.
let onDocChanged = () => {};

function hasDoc() {
    return doc.layers.length > 0;
}

function layerById(id) {
    return doc.layers.find((l) => l.id === id) || null;
}

function activeLayer() {
    return layerById(doc.activeId) || doc.layers[doc.layers.length - 1] || null;
}

function activeIndex() {
    return doc.layers.indexOf(activeLayer());
}

// Réglages actuellement édités dans le panneau Filtres.
function currentSettings() {
    if (target === 'layer' && activeLayer()) return activeLayer().settings;
    return doc.globals;
}

function makeLayer(name, canvas, settings) {
    return {
        id: ++layerSeq,
        name,
        visible: true,
        opacity: 1,
        canvas,
        settings: settings ? cloneSettings(settings) : defaultSettings(),
        version: 0,
    };
}

// Marque les pixels d'un calque comme modifiés (avant commit).
function touch(layer) {
    layer.version = ++versionSeq;
}

// ---------------------------------------------------------------------------
// Rendu d'un calque et de l'image entière
// ---------------------------------------------------------------------------

// Un calque avec ses réglages, à la taille (outW × outH).
function renderLayer(layer, outW, outH) {
    const out = blankCanvas(outW, outH);
    const ctx = out.getContext('2d');
    ctx.drawImage(layer.canvas, 0, 0, outW, outH);
    if (!isNeutralSettings(layer.settings)) {
        applySettingsToContext(ctx, outW, outH, layer.settings, outW / doc.w);
    }
    return out;
}

// Image entière : calques visibles (avec leur opacité), puis réglages globaux.
function renderComposite(outW, outH, withGlobals = true) {
    const out = blankCanvas(outW, outH);
    const ctx = out.getContext('2d');
    for (const layer of doc.layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(renderLayer(layer, outW, outH), 0, 0);
    }
    ctx.globalAlpha = 1;
    if (withGlobals && !isNeutralSettings(doc.globals)) {
        applySettingsToContext(ctx, outW, outH, doc.globals, outW / doc.w);
    }
    return out;
}

// Rotation (en degrés, sens horaire) d'un canevas : le canevas grandit pour tout contenir.
function rotateCanvas(src, angleDeg) {
    if (!angleDeg) return src;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = src.width, h = src.height;
    const nw = Math.round(w * cos + h * sin);
    const nh = Math.round(w * sin + h * cos);
    const out = blankCanvas(nw, nh);
    const ctx = out.getContext('2d');
    ctx.translate(nw / 2, nh / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -w / 2, -h / 2);
    return out;
}

// ---------------------------------------------------------------------------
// Historique : instantanés du document. Les canevas inchangés sont réutilisés.
// ---------------------------------------------------------------------------

const MAX_HISTORY = 30;
let history = [];
let historyIdx = -1;
let savedIdx = -1;               // position de l'historique correspondant au dernier enregistrement
const frozenPixels = new Map();  // id de calque -> { version, canvas } (copies figées)

function frozenCanvas(layer) {
    const cached = frozenPixels.get(layer.id);
    if (cached && cached.version === layer.version) return cached.canvas;
    const copy = cloneCanvas(layer.canvas);
    frozenPixels.set(layer.id, { version: layer.version, canvas: copy });
    return copy;
}

function snapshot() {
    return {
        w: doc.w,
        h: doc.h,
        activeId: doc.activeId,
        globals: cloneSettings(doc.globals),
        layers: doc.layers.map((l) => ({
            id: l.id,
            name: l.name,
            visible: l.visible,
            opacity: l.opacity,
            settings: cloneSettings(l.settings),
            version: l.version,
            canvas: frozenCanvas(l),
        })),
    };
}

function restore(snap) {
    doc.w = snap.w;
    doc.h = snap.h;
    doc.activeId = snap.activeId;
    doc.globals = cloneSettings(snap.globals);
    doc.layers = snap.layers.map((sl) => {
        frozenPixels.set(sl.id, { version: sl.version, canvas: sl.canvas });
        return {
            id: sl.id,
            name: sl.name,
            visible: sl.visible,
            opacity: sl.opacity,
            settings: cloneSettings(sl.settings),
            version: sl.version,
            canvas: cloneCanvas(sl.canvas),
        };
    });
}

// Enregistre l'état courant dans l'historique (après une modification).
function commit() {
    history = history.slice(0, historyIdx + 1);
    history.push(snapshot());
    if (history.length > MAX_HISTORY) {
        history.shift();
        savedIdx -= 1; // l'enregistrement peut sortir de l'historique : il ne sera plus retrouvé
    }
    historyIdx = history.length - 1;
    onDocChanged();
}

function undo() {
    if (historyIdx <= 0) return;
    historyIdx -= 1;
    restore(history[historyIdx]);
    onDocChanged();
}

function redo() {
    if (historyIdx >= history.length - 1) return;
    historyIdx += 1;
    restore(history[historyIdx]);
    onDocChanged();
}

function canUndo() { return historyIdx > 0; }
function canRedo() { return historyIdx < history.length - 1; }
function isDirty() { return hasDoc() && historyIdx !== savedIdx; }
function markSaved() { savedIdx = historyIdx; onDocChanged(); }

// Repart d'un document neuf : l'historique commence par son état initial, considéré comme enregistré.
function resetHistory(saved) {
    history = [];
    historyIdx = -1;
    frozenPixels.clear();
    history.push(snapshot());
    historyIdx = 0;
    savedIdx = saved ? 0 : -1;
}

// Remplace le document (image ouverte, projet ouvert, nouveau document).
function setDocument({ w, h, name, layers, activeId, globals, saved = false }) {
    doc.w = w;
    doc.h = h;
    doc.name = name;
    doc.layers = layers;
    doc.activeId = activeId ?? layers[layers.length - 1].id;
    doc.globals = globals ? cloneSettings(globals) : defaultSettings();
    resetHistory(saved);
    onDocChanged();
}

function clearDocument() {
    doc.w = 0;
    doc.h = 0;
    doc.layers = [];
    doc.activeId = null;
    doc.globals = defaultSettings();
    history = [];
    historyIdx = -1;
    savedIdx = -1;
    frozenPixels.clear();
    onDocChanged();
}

// ---------------------------------------------------------------------------
// Opérations sur les calques
// ---------------------------------------------------------------------------

function selectLayer(id) {
    if (!layerById(id)) return;
    doc.activeId = id;
    onDocChanged();
}

// Nouveau calque vide, au-dessus du calque actif.
function addLayer(canvas, name) {
    if (!hasDoc()) return null;
    const layer = makeLayer(name || `Calque ${doc.layers.length + 1}`, canvas || blankCanvas(doc.w, doc.h));
    touch(layer);
    doc.layers.splice(activeIndex() + 1, 0, layer);
    doc.activeId = layer.id;
    commit();
    return layer;
}

function duplicateLayer() {
    const src = activeLayer();
    if (!src) return;
    const copy = makeLayer(`${src.name} copie`, cloneCanvas(src.canvas), src.settings);
    copy.visible = src.visible;
    copy.opacity = src.opacity;
    touch(copy);
    doc.layers.splice(activeIndex() + 1, 0, copy);
    doc.activeId = copy.id;
    commit();
}

function deleteLayer() {
    if (doc.layers.length <= 1) return;
    const idx = activeIndex();
    doc.layers.splice(idx, 1);
    doc.activeId = doc.layers[Math.max(0, idx - 1)].id;
    commit();
}

// delta = -1 (descendre) ou +1 (monter), dans la pile des calques.
function moveLayer(delta) {
    const idx = activeIndex();
    const to = idx + delta;
    if (to < 0 || to >= doc.layers.length) return;
    const [layer] = doc.layers.splice(idx, 1);
    doc.layers.splice(to, 0, layer);
    commit();
}

// Fusionne le calque actif dans celui du dessous (avec ses réglages et son opacité).
function mergeDown() {
    const idx = activeIndex();
    if (idx <= 0) return;
    const top = doc.layers[idx];
    const below = doc.layers[idx - 1];
    const ctx = below.canvas.getContext('2d');
    ctx.globalAlpha = top.opacity;
    ctx.drawImage(renderLayer(top, doc.w, doc.h), 0, 0);
    ctx.globalAlpha = 1;
    touch(below);
    doc.layers.splice(idx, 1);
    doc.activeId = below.id;
    commit();
}

// Une seule couche : les calques visibles sont fusionnés (les masqués sont abandonnés).
function flattenLayers() {
    if (doc.layers.length <= 1) return;
    const visible = doc.layers.filter((l) => l.visible);
    const canvas = renderComposite(doc.w, doc.h, false);
    const layer = makeLayer('Image aplatie', canvas);
    touch(layer);
    doc.layers = [layer];
    doc.activeId = layer.id;
    commit();
    return visible.length;
}

function setLayerVisible(id, visible) {
    const layer = layerById(id);
    if (!layer || layer.visible === visible) return;
    layer.visible = visible;
    commit();
}

function setLayerOpacity(id, opacity, final) {
    const layer = layerById(id);
    if (!layer) return;
    layer.opacity = Math.max(0, Math.min(1, opacity));
    if (final) commit(); else onDocChanged();
}

function renameLayer(id, name) {
    const layer = layerById(id);
    const clean = (name || '').trim();
    if (!layer || !clean || clean === layer.name) return;
    layer.name = clean;
    commit();
}

// Modification de pixels d'un calque (dessin, effacement, effet) : marquée puis enregistrée.
function commitLayerPixels(layer) {
    touch(layer);
    commit();
}

// ---------------------------------------------------------------------------
// Opérations sur l'image entière (tous les calques)
// ---------------------------------------------------------------------------

function transformLayers(fn, newW, newH) {
    for (const layer of doc.layers) {
        layer.canvas = fn(layer.canvas);
        touch(layer);
    }
    if (newW) { doc.w = newW; doc.h = newH; }
    commit();
}

function flipDocument(horizontal) {
    if (!hasDoc()) return;
    transformLayers((src) => {
        const out = blankCanvas(src.width, src.height);
        const ctx = out.getContext('2d');
        ctx.translate(horizontal ? src.width : 0, horizontal ? 0 : src.height);
        ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
        ctx.drawImage(src, 0, 0);
        return out;
    });
}

function resizeDocument(w, h) {
    if (!hasDoc() || w < 1 || h < 1) return;
    transformLayers((src) => {
        const out = blankCanvas(w, h);
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, w, h);
        return out;
    }, w, h);
}

function cropDocument(x, y, w, h) {
    if (!hasDoc() || w < 1 || h < 1) return;
    transformLayers((src) => {
        const out = blankCanvas(w, h);
        out.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
        return out;
    }, w, h);
}

// Applique la rotation de prévisualisation aux calques (le document grandit pour tout contenir).
function bakeRotation(angleDeg) {
    if (!hasDoc() || !angleDeg) return;
    const first = rotateCanvas(doc.layers[0].canvas, angleDeg);
    const nw = first.width, nh = first.height;
    for (const layer of doc.layers) {
        layer.canvas = rotateCanvas(layer.canvas, angleDeg);
        touch(layer);
    }
    doc.w = nw;
    doc.h = nh;
    commit();
}

// ---------------------------------------------------------------------------
// Fichier projet (.pictone) : JSON, chaque calque en PNG.
// ---------------------------------------------------------------------------

function projectData() {
    return {
        format: 'pictone',
        version: 1,
        name: doc.name,
        w: doc.w,
        h: doc.h,
        activeId: doc.activeId,
        globals: cloneSettings(doc.globals),
        layers: doc.layers.map((l) => ({
            id: l.id,
            name: l.name,
            visible: l.visible,
            opacity: l.opacity,
            settings: cloneSettings(l.settings),
            png: l.canvas.toDataURL('image/png'),
        })),
    };
}

function loadImageFrom(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image illisible'));
        img.src = src;
    });
}

async function documentFromProject(data) {
    if (!data || data.format !== 'pictone' || !Array.isArray(data.layers) || !data.layers.length) {
        throw new Error("Ce fichier n'est pas un projet PicTone valide.");
    }
    const layers = [];
    for (const sl of data.layers) {
        const img = await loadImageFrom(sl.png);
        const canvas = blankCanvas(data.w, data.h);
        canvas.getContext('2d').drawImage(img, 0, 0, data.w, data.h);
        const layer = makeLayer(sl.name, canvas, sl.settings);
        layer.id = sl.id;
        layer.visible = sl.visible !== false;
        layer.opacity = typeof sl.opacity === 'number' ? sl.opacity : 1;
        touch(layer);
        layers.push(layer);
        layerSeq = Math.max(layerSeq, sl.id);
    }
    return {
        w: data.w,
        h: data.h,
        name: data.name || 'projet',
        layers,
        activeId: data.activeId,
        globals: data.globals,
        saved: true,
    };
}
