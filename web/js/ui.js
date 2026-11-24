/* ==========================================================================
   PicTone — interface : panneaux, calques, réglages, menus natifs, raccourcis,
   fermeture avec confirmation, dialogues et initialisation.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Éléments de l'interface
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const fileInput       = $('file-input');
const dropZone        = $('drop-zone');
const fileNameText    = $('file-name-text');
const fileSizeText    = $('file-size-text');
const btnUndo         = $('btn-undo');
const btnRedo         = $('btn-redo');
const btnExport       = $('btn-save');
const btnSaveProject  = $('btn-save-project');
const btnReset        = $('btn-reset');
const sidebarTabs     = document.querySelectorAll('.sidebar-tab');
const sidebarPanels   = document.querySelectorAll('.sidebar-panel');
const filterCards     = document.querySelectorAll('.filter-item');
const targetImageBtn  = $('btn-target-image');
const targetLayerBtn  = $('btn-target-layer');
const targetHint      = $('target-hint');
const sliderBlur      = $('slider-blur');
const inputBlur       = $('input-blur');
const sliderOpacity   = $('slider-opacity');
const inputOpacity    = $('input-opacity');
const sliderBrightness = $('slider-brightness');
const inputBrightness  = $('input-brightness');
const sliderContrast   = $('slider-contrast');
const inputContrast    = $('input-contrast');
const sliderSaturation = $('slider-saturation');
const inputSaturation  = $('input-saturation');
const layersList      = $('layers-list');
const layerOpacity    = $('layer-opacity');
const inputLayerOpacity = $('input-layer-opacity');
const layerActiveName = $('layer-active-name');
const brushBtns       = document.querySelectorAll('.brush-btn');
const brushSizeSlider = $('brush-size-slider');
const inputBrushSize  = $('input-brush-size');
const brushOpacitySlider = $('brush-opacity-slider');
const inputBrushOpacity  = $('input-brush-opacity');
const brushColorPicker   = $('brush-color-picker');
const colorPresets    = document.querySelectorAll('.color-preset');
const rotationSlider  = $('slider-rotation');
const inputRotation   = $('input-rotation');
const btnRotationApply = $('btn-rotation-apply');
const resizeW         = $('resize-width');
const resizeH         = $('resize-height');
const resizeChain     = $('resize-chain');
const resizeKeep      = $('resize-keep-ratio');
const formatBtns      = document.querySelectorAll('.format-btn');
const qualityBox      = $('quality-slider-container');
const sliderQuality   = $('export-quality');
const inputQuality    = $('input-export-quality');
const appModal        = $('app-modal');
const modalTitle      = $('modal-title');
const modalMessage    = $('modal-message');
const modalBtnCancel  = $('modal-btn-cancel');
const modalBtnConfirm = $('modal-btn-confirm');
const modalClose      = $('modal-close');
const quitModal       = $('quit-modal');
const shortcutsModal  = $('shortcuts-modal');

let modalResolver = null;
let pendingFileMode = 'open';   // 'open' ou 'layer' : ce que fait le prochain fichier choisi

// ---------------------------------------------------------------------------
// Dialogues (intégrés à l'interface : alert() ne s'affiche pas dans la fenêtre native)
// ---------------------------------------------------------------------------

function openModal(title, message, { cancel = null, confirm = 'OK' } = {}) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalBtnCancel.style.display = cancel ? 'block' : 'none';
        modalBtnCancel.textContent = cancel || 'Annuler';
        modalBtnConfirm.textContent = confirm;
        appModal.classList.remove('hidden');
        modalResolver = (result) => { appModal.classList.add('hidden'); modalResolver = null; resolve(result); };
    });
}

function showAlert(title, message) {
    return openModal(title, message).then(() => undefined);
}

function showConfirm(title, message) {
    return openModal(title, message, { cancel: 'Annuler', confirm: 'Confirmer' });
}

modalBtnConfirm.addEventListener('click', () => { if (modalResolver) modalResolver(true); });
modalBtnCancel.addEventListener('click', () => { if (modalResolver) modalResolver(false); });
modalClose.addEventListener('click', () => { if (modalResolver) modalResolver(false); });
appModal.addEventListener('click', (e) => { if (e.target === appModal && modalResolver) modalResolver(false); });

function isTextFieldFocused() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

// ---------------------------------------------------------------------------
// Onglets de la barre latérale
// ---------------------------------------------------------------------------

function showSidebarTab(name) {
    sidebarTabs.forEach((t) => t.classList.toggle('active', t.dataset.panel === `panel-${name}`));
    sidebarPanels.forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
    refreshPanels();
}

sidebarTabs.forEach((tab) => tab.addEventListener('click', () => {
    showSidebarTab(tab.dataset.panel.replace('panel-', ''));
}));

// ---------------------------------------------------------------------------
// Réglages : filtres et ajustements, appliqués à l'image entière ou au calque actif
// ---------------------------------------------------------------------------

function setTarget(t) {
    target = t;
    refreshPanels();
    scheduleRender();
}

targetImageBtn.addEventListener('click', () => setTarget('image'));
targetLayerBtn.addEventListener('click', () => { if (activeLayer()) setTarget('layer'); });

function toggleFilter(name) {
    const s = currentSettings();
    if (name === 'Aucun') {
        s.filters = ['Aucun'];
    } else {
        s.filters = s.filters.filter((f) => f !== 'Aucun');
        s.filters = s.filters.includes(name) ? s.filters.filter((f) => f !== name) : [...s.filters, name];
        if (!s.filters.length) s.filters = ['Aucun'];
    }
    commit();
}

filterCards.forEach((card) => card.addEventListener('click', () => {
    if (!hasDoc()) return;
    toggleFilter(card.dataset.filter);
}));

// Lie un curseur et sa zone de saisie à un réglage numérique.
function bindSetting(slider, input, key, { decimals = 0 } = {}) {
    const apply = (value, final) => {
        const s = currentSettings();
        s[key] = value;
        if (final) commit(); else scheduleRender();
        refreshThumbnailsSoon();
    };
    slider.addEventListener('input', () => {
        const v = Number(slider.value);
        input.value = v.toFixed(decimals).replace(/\.0+$/, '');
        apply(v, false);
    });
    slider.addEventListener('change', () => apply(Number(slider.value), true));
    input.addEventListener('change', () => {
        const v = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(input.value) || 0));
        slider.value = String(v);
        input.value = String(v);
        apply(v, true);
    });
}

bindSetting(sliderBlur, inputBlur, 'blur', { decimals: 1 });
bindSetting(sliderOpacity, inputOpacity, 'filterOpacity');
bindSetting(sliderBrightness, inputBrightness, 'brightness');
bindSetting(sliderContrast, inputContrast, 'contrast');
bindSetting(sliderSaturation, inputSaturation, 'saturation');

// Affiche les réglages du panneau Filtres selon la cible et le réglage courant.
function refreshFiltersPanel() {
    const s = currentSettings();
    const layer = activeLayer();
    targetImageBtn.classList.toggle('active', target === 'image');
    targetLayerBtn.classList.toggle('active', target === 'layer');
    targetLayerBtn.disabled = !layer;
    targetHint.textContent = target === 'image'
        ? "Les filtres et réglages s'appliquent à l'image entière, par-dessus tous les calques."
        : `Les filtres et réglages s'appliquent uniquement au calque « ${layer ? layer.name : ''} ».`;
    filterCards.forEach((card) => card.classList.toggle('active', s.filters.includes(card.dataset.filter)));
    $('slider-blur-container').classList.toggle('hidden', !s.filters.includes('Flou'));
    $('slider-opacity-container').classList.toggle('hidden', !s.filters.includes('Opacité'));
    const set = (slider, input, v) => {
        if (document.activeElement !== input) input.value = String(v);
        slider.value = String(v);
    };
    set(sliderBlur, inputBlur, s.blur);
    set(sliderOpacity, inputOpacity, s.filterOpacity);
    set(sliderBrightness, inputBrightness, s.brightness);
    set(sliderContrast, inputContrast, s.contrast);
    set(sliderSaturation, inputSaturation, s.saturation);
    $('filters-controls').classList.toggle('disabled', !hasDoc());
}

// ---------------------------------------------------------------------------
// Calques
// ---------------------------------------------------------------------------

function layerThumb(layer) {
    const c = document.createElement('canvas');
    const h = 36;
    c.width = Math.max(1, Math.round(h * doc.w / doc.h));
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(layer.canvas, 0, 0, c.width, c.height);
    return c;
}

function refreshLayers() {
    layersList.textContent = '';
    if (!hasDoc()) return;
    // Du calque du dessus au calque du fond
    for (const layer of [...doc.layers].reverse()) {
        const row = document.createElement('div');
        row.className = 'layer-row' + (layer.id === doc.activeId ? ' selected' : '') + (layer.visible ? '' : ' hidden-layer');
        row.dataset.id = String(layer.id);

        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'layer-eye';
        eye.title = layer.visible ? 'Masquer le calque' : 'Afficher le calque';
        eye.setAttribute('aria-label', eye.title);
        eye.textContent = layer.visible ? '👁' : '—';
        eye.addEventListener('click', (e) => { e.stopPropagation(); setLayerVisible(layer.id, !layer.visible); });

        const thumb = layerThumb(layer);
        thumb.className = 'layer-thumb';

        const name = document.createElement('span');
        name.className = 'layer-name';
        name.textContent = layer.name;
        name.title = 'Double-cliquer pour renommer';
        name.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = layer.name;
            input.className = 'layer-rename';
            input.addEventListener('click', (ev) => ev.stopPropagation());
            const done = (save) => {
                if (save) renameLayer(layer.id, input.value); else refreshLayers();
            };
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') done(true);
                if (ev.key === 'Escape') done(false);
            });
            input.addEventListener('blur', () => done(true));
            name.replaceWith(input);
            input.focus();
            input.select();
        });

        row.addEventListener('click', () => selectLayer(layer.id));
        row.append(eye, thumb, name);
        layersList.appendChild(row);
    }
    const layer = activeLayer();
    layerActiveName.textContent = layer ? layer.name : '';
    layerOpacity.disabled = !layer;
    inputLayerOpacity.disabled = !layer;
    if (layer) {
        layerOpacity.value = String(Math.round(layer.opacity * 100));
        inputLayerOpacity.value = layerOpacity.value;
    }
    const idx = activeIndex();
    $('btn-layer-up').disabled = idx < 0 || idx >= doc.layers.length - 1;
    $('btn-layer-down').disabled = idx <= 0;
    $('btn-layer-merge').disabled = idx <= 0;
    $('btn-layer-del').disabled = doc.layers.length <= 1;
    $('btn-layer-flatten').disabled = doc.layers.length <= 1;
    $('btn-layer-add').disabled = !hasDoc();
    $('btn-layer-dup').disabled = !hasDoc();
}

layerOpacity.addEventListener('input', () => {
    const layer = activeLayer();
    if (!layer) return;
    inputLayerOpacity.value = layerOpacity.value;
    setLayerOpacity(layer.id, Number(layerOpacity.value) / 100, false);
});
layerOpacity.addEventListener('change', () => {
    const layer = activeLayer();
    if (layer) setLayerOpacity(layer.id, Number(layerOpacity.value) / 100, true);
});
inputLayerOpacity.addEventListener('change', () => {
    const layer = activeLayer();
    if (!layer) return;
    const v = Math.max(0, Math.min(100, Number(inputLayerOpacity.value) || 0));
    layerOpacity.value = String(v);
    setLayerOpacity(layer.id, v / 100, true);
});

$('btn-layer-add').addEventListener('click', () => addLayer());
$('btn-layer-dup').addEventListener('click', () => duplicateLayer());
$('btn-layer-del').addEventListener('click', () => deleteLayer());
$('btn-layer-up').addEventListener('click', () => moveLayer(1));
$('btn-layer-down').addEventListener('click', () => moveLayer(-1));
$('btn-layer-merge').addEventListener('click', () => mergeDown());
$('btn-layer-flatten').addEventListener('click', async () => {
    if (!(await showConfirm('Aplatir les calques ?', 'Les calques visibles seront fusionnés en un seul. Vous pourrez revenir en arrière avec Annuler.'))) return;
    flattenLayers();
});

// ---------------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------------

brushBtns.forEach((btn) => btn.addEventListener('click', () => {
    activeBrush = btn.dataset.brush;
    brushBtns.forEach((b) => b.classList.toggle('active', b === btn));
    updateCursorSize();
}));

function bindBrushSetting(slider, input, onValue, { min, max }) {
    const set = (v) => { onValue(v); };
    slider.addEventListener('input', () => { input.value = slider.value; set(Number(slider.value)); });
    input.addEventListener('change', () => {
        const v = Math.max(min, Math.min(max, Number(input.value) || min));
        slider.value = String(v);
        input.value = String(v);
        set(v);
    });
}
bindBrushSetting(brushSizeSlider, inputBrushSize, (v) => { brushSize = v; updateCursorSize(); }, { min: 1, max: 80 });
bindBrushSetting(brushOpacitySlider, inputBrushOpacity, (v) => { brushOpacity = v / 100; }, { min: 5, max: 100 });

brushColorPicker.addEventListener('input', () => {
    brushColor = brushColorPicker.value;
    colorPresets.forEach((p) => p.classList.toggle('active', p.dataset.color === brushColor));
});
colorPresets.forEach((preset) => preset.addEventListener('click', () => {
    brushColor = preset.dataset.color;
    brushColorPicker.value = brushColor;
    colorPresets.forEach((p) => p.classList.toggle('active', p === preset));
}));

$('btn-clear-draw').addEventListener('click', async () => {
    const layer = activeLayer();
    if (!layer) return;
    if (!(await showConfirm('Effacer le calque', `Effacer tout le contenu du calque « ${layer.name} » ? Annuler permet de revenir en arrière.`))) return;
    layer.canvas.getContext('2d').clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    commitLayerPixels(layer);
});

// ---------------------------------------------------------------------------
// Transformer : rotation d'aperçu, miroirs, recadrage, redimensionnement
// ---------------------------------------------------------------------------

function setRotationPreview(v) {
    rotation = Math.max(-180, Math.min(180, v));
    rotationSlider.value = String(rotation);
    inputRotation.value = String(Math.round(rotation));
    btnRotationApply.classList.toggle('hidden', rotation === 0);
    applyViewTransform();
}

rotationSlider.addEventListener('input', () => setRotationPreview(Number(rotationSlider.value)));
inputRotation.addEventListener('change', () => setRotationPreview(Number(inputRotation.value) || 0));
btnRotationApply.addEventListener('click', () => {
    const angle = rotation;
    setRotationPreview(0);
    bakeRotation(angle);
});

$('btn-flip-h').addEventListener('click', () => flipDocument(true));
$('btn-flip-v').addEventListener('click', () => flipDocument(false));
$('btn-crop-start').addEventListener('click', () => startCrop());
$('btn-crop-apply').addEventListener('click', () => applyCrop());
$('btn-crop-cancel').addEventListener('click', () => cancelCrop());

let resizeRatio = 1;
resizeChain.addEventListener('click', () => {
    resizeKeep.checked = !resizeKeep.checked;
    resizeChain.classList.toggle('active', resizeKeep.checked);
});
resizeW.addEventListener('input', () => {
    if (resizeKeep.checked && doc.w) resizeH.value = String(Math.round((Number(resizeW.value) || 0) / resizeRatio));
});
resizeH.addEventListener('input', () => {
    if (resizeKeep.checked && doc.h) resizeW.value = String(Math.round((Number(resizeH.value) || 0) * resizeRatio));
});
$('btn-resize-apply').addEventListener('click', async () => {
    const w = Math.round(Number(resizeW.value));
    const h = Math.round(Number(resizeH.value));
    if (!w || !h || w < 1 || h < 1) {
        await showAlert('Dimensions invalides', 'Entrez une largeur et une hauteur supérieures à 0.');
        return;
    }
    resizeDocument(w, h);
});

function refreshTransformPanel() {
    resizeChain.classList.toggle('active', resizeKeep.checked);
    if (hasDoc()) {
        resizeRatio = doc.w / doc.h;
        if (document.activeElement !== resizeW) resizeW.value = String(doc.w);
        if (document.activeElement !== resizeH) resizeH.value = String(doc.h);
    }
    $('transform-controls').classList.toggle('disabled', !hasDoc() || isCropping);
    $('btn-crop-start').disabled = !hasDoc() || isCropping;
}

// ---------------------------------------------------------------------------
// Export (pied de barre latérale)
// ---------------------------------------------------------------------------

formatBtns.forEach((btn) => btn.addEventListener('click', () => {
    exportFormat = btn.dataset.fmt;
    formatBtns.forEach((b) => b.classList.toggle('active', b === btn));
    qualityBox.classList.toggle('hidden', exportFormat === 'png');
}));

function bindQuality() {
    sliderQuality.addEventListener('input', () => {
        exportQuality = Number(sliderQuality.value) / 100;
        inputQuality.value = sliderQuality.value;
    });
    inputQuality.addEventListener('change', () => {
        const v = Math.max(1, Math.min(100, Number(inputQuality.value) || 90));
        sliderQuality.value = String(v);
        inputQuality.value = String(v);
        exportQuality = v / 100;
    });
}
bindQuality();

btnExport.addEventListener('click', () => { exportImage(); });
btnSaveProject.addEventListener('click', () => { saveProject(); });
btnReset.addEventListener('click', async () => {
    if (!hasDoc()) return;
    if (!(await showConfirm("Fermer l'image", 'Fermer le document en cours ? Les modifications non enregistrées seront perdues.'))) return;
    clearDocument();
});

// ---------------------------------------------------------------------------
// Barre d'outils : annuler, rétablir, comparaison, zoom
// ---------------------------------------------------------------------------

btnUndo.addEventListener('click', () => undo());
btnRedo.addEventListener('click', () => redo());
tabEditBtn.addEventListener('click', () => setSplitView(false));
tabSplitBtn.addEventListener('click', () => setSplitView(true));
$('btn-zoom-in').addEventListener('click', () => setZoom(zoom * 1.25));
$('btn-zoom-out').addEventListener('click', () => setZoom(zoom / 1.25));
$('btn-zoom-fit').addEventListener('click', () => zoomFit());
$('btn-zoom-actual').addEventListener('click', () => zoomActual());

// ---------------------------------------------------------------------------
// Fichiers : bouton Ouvrir, zone de dépôt, glisser-déposer
// ---------------------------------------------------------------------------

function chooseFile(mode) {
    pendingFileMode = mode;
    fileInput.click();
}

fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (pendingFileMode === 'layer') addImageFromFile(file); else openFile(file);
    pendingFileMode = 'open';
});

dropZone.addEventListener('click', () => chooseFile('open'));
$('btn-open').addEventListener('click', () => chooseFile('open'));
$('btn-add-layer').addEventListener('click', () => chooseFile('layer'));

['dragenter', 'dragover'].forEach((evt) => viewport.addEventListener(evt, (e) => e.preventDefault()));
['dragenter', 'dragover'].forEach((evt) => emptyStateEl.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((evt) => dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover')));
dropZone.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });
[editorEl, viewport].forEach((el) => el.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.name.toLowerCase().endsWith(PROJECT_EXT)) openFile(f); else addImageFromFile(f);
}));

// ---------------------------------------------------------------------------
// Raccourcis clavier (⌘ sous macOS, Ctrl sous Windows)
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
        if (!shortcutsModal.classList.contains('hidden')) { hideShortcuts(); return; }
        if (modalResolver) { modalResolver(false); return; }
        if (quitModal && !quitModal.classList.contains('hidden')) return;
        if (isCropping) cancelCrop();
        return;
    }
    if (isTextFieldFocused() && !(mod && (key === 's' || key === 'o'))) return;

    if (mod && !e.altKey) {
        const run = (fn) => { e.preventDefault(); fn(); };
        if (key === 'o' && !e.shiftKey) return run(() => chooseFile('open'));
        if (key === 's' && !e.shiftKey) return run(() => saveProject());
        if (key === 'e' && e.shiftKey) return run(() => exportImage());
        if (key === 'z' && !e.shiftKey) return run(() => undo());
        if ((key === 'z' && e.shiftKey) || key === 'y') return run(() => redo());
        if (key === 'n' && e.shiftKey) return run(() => addLayer());
        if (key === 'j' && !e.shiftKey) return run(() => duplicateLayer());
        if (key === 'e' && !e.shiftKey) return run(() => mergeDown());
        if (key === ']' && !e.shiftKey) return run(() => moveLayer(1));
        if (key === '[' && !e.shiftKey) return run(() => moveLayer(-1));
        if (key === 'c' || key === 'x') {
            if (hasDoc() && !isTextFieldFocused()) return run(() => copyImageToClipboard());
        }
        if (key === 'v' && !isTextFieldFocused()) return run(() => pasteFromClipboard());
        if (key === '=' || key === '+') return run(() => setZoom(zoom * 1.25));
        if (key === '-') return run(() => setZoom(zoom / 1.25));
        if (key === '0') return run(() => zoomFit());
        if (key === '1') return run(() => zoomActual());
        if (key === '\\') return run(() => setSplitView(!splitView));
        if (key === '/') return run(() => showShortcuts());
        return;
    }
    if (!mod && hasDoc() && !isCropping) {
        if (key === '[') { brushSize = Math.max(1, brushSize - 2); syncBrushSizeUI(); }
        if (key === ']') { brushSize = Math.min(80, brushSize + 2); syncBrushSizeUI(); }
    }
    if (isCropping && e.key === 'Enter') applyCrop();
});

function syncBrushSizeUI() {
    brushSizeSlider.value = String(brushSize);
    inputBrushSize.value = String(brushSize);
    updateCursorSize();
}

// ---------------------------------------------------------------------------
// Aide : raccourcis
// ---------------------------------------------------------------------------

function showShortcuts() {
    shortcutsModal.classList.remove('hidden');
}

function hideShortcuts() {
    shortcutsModal.classList.add('hidden');
}

$('shortcuts-close').addEventListener('click', hideShortcuts);
shortcutsModal.addEventListener('click', (e) => { if (e.target === shortcutsModal) hideShortcuts(); });

async function showAboutDialog() {
    let version = '';
    try { version = await window.pywebview.api.get_version(); } catch (e) { version = ''; }
    await showAlert('À propos de PicTone', `PicTone ${version}\nÉditeur d'images local, avec calques.`);
}

// ---------------------------------------------------------------------------
// Commandes des menus natifs (appelées depuis Rust : picToneCommand('…'))
// ---------------------------------------------------------------------------

window.picToneCommand = (cmd) => {
    switch (cmd) {
        case 'open':            chooseFile('open'); break;
        case 'save':            saveProject(); break;
        case 'export':          exportImage(); break;
        case 'close':           btnReset.click(); break;
        case 'undo':            undo(); break;
        case 'redo':            redo(); break;
        case 'cut':
        case 'copy':            if (!isTextFieldFocused()) copyImageToClipboard(); else document.execCommand(cmd); break;
        case 'paste':           if (isTextFieldFocused()) document.execCommand('paste'); else pasteFromClipboard(); break;
        case 'selectAll':       if (isTextFieldFocused()) document.activeElement.select(); break;
        case 'zoomIn':          setZoom(zoom * 1.25); break;
        case 'zoomOut':         setZoom(zoom / 1.25); break;
        case 'zoomFit':         zoomFit(); break;
        case 'zoomActual':      zoomActual(); break;
        case 'toggleSplit':     setSplitView(!splitView); break;
        case 'tabFilters':      showSidebarTab('filters'); break;
        case 'tabLayers':       showSidebarTab('layers'); break;
        case 'tabDraw':         showSidebarTab('draw'); break;
        case 'tabTransform':    showSidebarTab('transform'); break;
        case 'newLayer':        addLayer(); break;
        case 'duplicateLayer':  duplicateLayer(); break;
        case 'deleteLayer':     deleteLayer(); break;
        case 'moveLayerUp':     moveLayer(1); break;
        case 'moveLayerDown':   moveLayer(-1); break;
        case 'mergeDown':       mergeDown(); break;
        case 'flatten':        $('btn-layer-flatten').click(); break;
        case 'cropStart':       startCrop(); break;
        case 'flipH':           flipDocument(true); break;
        case 'flipV':           flipDocument(false); break;
        case 'resize':          showSidebarTab('transform'); resizeW.focus(); break;
        case 'shortcuts':       showShortcuts(); break;
        case 'checkUpdates':    checkUpdatesWithReport(); break;
        case 'about':           showAboutDialog(); break;
        default: updLog(`commande de menu inconnue : ${cmd}`);
    }
    updLog(`commande de menu : ${cmd}`);
};

// États des menus natifs : grisés quand la commande n'a pas de sens.
let lastPublishedStates = '';
function publishMenuStates() {
    const api = nativeApi();
    const has = hasDoc();
    const layer = activeLayer();
    const idx = activeIndex();
    const states = {
        open: true,
        save: has,
        export: has,
        close: has,
        undo: canUndo(),
        redo: canRedo(),
        cut: has,
        copy: has,
        paste: true,
        selectAll: has,
        zoomIn: has,
        zoomOut: has,
        zoomFit: has,
        zoomActual: has,
        toggleSplit: has,
        tabFilters: has,
        tabLayers: has,
        tabDraw: has,
        tabTransform: has,
        newLayer: has,
        duplicateLayer: has && !!layer,
        deleteLayer: has && doc.layers.length > 1,
        moveLayerUp: has && idx < doc.layers.length - 1,
        moveLayerDown: has && idx > 0,
        mergeDown: has && idx > 0,
        flatten: has && doc.layers.length > 1,
        cropStart: has && !isCropping,
        flipH: has,
        flipV: has,
        resize: has,
        shortcuts: true,
        checkUpdates: true,
        about: true,
    };
    const json = JSON.stringify(states);
    if (json === lastPublishedStates) return;
    if (!api || typeof api.set_command_states !== 'function') return;
    lastPublishedStates = json;
    Promise.resolve(api.set_command_states(states)).catch(() => {});
}

// Nom utilisé par le moteur de mise à jour (updater.js) pour publier l'état des menus.
function updateControlStates() {
    publishMenuStates();
}

// ---------------------------------------------------------------------------
// Rafraîchissement global
// ---------------------------------------------------------------------------

function refreshPanels() {
    refreshFiltersPanel();
    refreshLayers();
    refreshTransformPanel();
    $('draw-controls').classList.toggle('disabled', !hasDoc());
    $('layers-controls').classList.toggle('disabled', !hasDoc());
}

function refreshAll() {
    const has = hasDoc();
    emptyStateEl.classList.toggle('hidden', has);
    editorEl.classList.toggle('hidden', !has);
    if (has) {
        fileNameText.textContent = doc.name;
        fileSizeText.textContent = `${doc.w} × ${doc.h} px`;
        document.title = `${doc.name}${isDirty() ? ' •' : ''} — PicTone`;
        if (!isCropping) applyViewTransform();
        scheduleRender();
    } else {
        fileNameText.textContent = '-';
        fileSizeText.textContent = '-';
        document.title = 'PicTone';
    }
    if (target === 'layer' && !activeLayer()) target = 'image';
    btnUndo.disabled = !canUndo();
    btnRedo.disabled = !canRedo();
    btnExport.disabled = !has;
    btnSaveProject.disabled = !has;
    btnReset.disabled = !has;
    $('btn-open').disabled = false;
    $('btn-zoom-in').disabled = !has;
    $('btn-zoom-out').disabled = !has;
    $('btn-zoom-fit').disabled = !has;
    $('btn-zoom-actual').disabled = !has;
    tabEditBtn.disabled = !has;
    tabSplitBtn.disabled = !has;
    $('btn-flip-h').disabled = !has;
    $('btn-flip-v').disabled = !has;
    refreshPanels();
    publishMenuStates();
}

onDocChanged = refreshAll;

// ---------------------------------------------------------------------------
// Miniatures des filtres (rendu réel sur une image de test)
// ---------------------------------------------------------------------------

const TEST_IMAGE_SRC = 'assets/test-filtres.png';
const THUMB_WIDTH = 240;
let testImage = null;
let testImageLoading = null;
let thumbTimer = null;

function loadTestImage() {
    if (testImage) return Promise.resolve(testImage);
    if (!testImageLoading) {
        testImageLoading = loadImageFrom(TEST_IMAGE_SRC).then((img) => { testImage = img; return img; });
    }
    return testImageLoading;
}

async function renderFilterThumbnails() {
    if (!filterCards.length) return;
    let img;
    try { img = await loadTestImage(); } catch (e) { return; }
    const thumbW = THUMB_WIDTH;
    const thumbH = Math.round(THUMB_WIDTH * img.height / img.width);
    const s = currentSettings();
    filterCards.forEach((card) => {
        const canvas = card.querySelector('.filter-thumb');
        if (!canvas) return;
        canvas.width = thumbW;
        canvas.height = thumbH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, thumbW, thumbH);
        ctx.drawImage(img, 0, 0, thumbW, thumbH);
        applySettingsToContext(ctx, thumbW, thumbH, {
            filters: [card.dataset.filter],
            blur: s.blur,
            filterOpacity: s.filterOpacity,
            brightness: 0, contrast: 0, saturation: 0,
        }, thumbW / img.width);
    });
}

function refreshThumbnailsSoon() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(renderFilterThumbnails, 60);
}

// ---------------------------------------------------------------------------
// Fermeture avec modifications non enregistrées
// ---------------------------------------------------------------------------

function askQuitChoice() {
    return new Promise((resolve) => {
        const buttons = quitModal.querySelectorAll('[data-quit-choice]');
        const finish = (choice) => {
            quitModal.classList.add('hidden');
            buttons.forEach((b) => b.removeEventListener('click', onClick));
            document.removeEventListener('keydown', onKey, true);
            resolve(choice);
        };
        const onClick = (e) => finish(e.currentTarget.dataset.quitChoice);
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish('cancel'); } };
        buttons.forEach((b) => b.addEventListener('click', onClick));
        document.addEventListener('keydown', onKey, true);
        quitModal.classList.remove('hidden');
    });
}

function quitApp() {
    const api = nativeApi();
    if (api && typeof api.quit_app === 'function') api.quit_app();
}

async function handleQuitRequest() {
    if (!isDirty()) { quitApp(); return; }
    const choice = await askQuitChoice();
    if (choice === 'cancel') return;
    if (choice === 'quit') { quitApp(); return; }
    const saved = await saveProject();
    if (saved) quitApp();
}
window.addEventListener('pictone-quit-request', handleQuitRequest);

// Avertit le navigateur quand un document est modifié (utile hors application).
window.addEventListener('beforeunload', (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

function applyPlatformShortcuts() {
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) return;
    document.querySelectorAll('[title*="Ctrl+"]').forEach((el) => { el.title = el.title.replace(/Ctrl\+/g, '⌘'); });
    document.querySelectorAll('[data-shortcut*="Ctrl+"]').forEach((el) => {
        el.dataset.shortcut = el.dataset.shortcut.replace(/Ctrl\+/g, '⌘');
    });
    document.querySelectorAll('.format-hint').forEach((el) => { el.textContent = el.textContent.replace(/Ctrl\+/g, '⌘'); });
}

function initEditor() {
    applyPlatformShortcuts();
    clearDocument();
    refreshAll();
    renderFilterThumbnails();
    setSplitView(false);
    setRotationPreview(0);
    zoomFit();
}

initEditor();
