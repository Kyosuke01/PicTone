/* ==========================================================================
   PicTone v3.0 — Application Logic
   Modules: Image loading · Filters · Adjustments · Drawing · Transform · Export
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. GLOBAL STATE
// ---------------------------------------------------------------------------

let originalImage = null;        // The source HTMLImageElement (always the "base truth")
let originalFileName = "image";  // Base name without extension
let activeFilters = ["Aucun"];

// Adjustments
let brightness = 0;
let contrast   = 0;
let saturation = 0;

// Drawing state
let isDrawing = false;
let isRightClickDrawing = false;
let lastX = 0;
let lastY = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let lastHoveredCanvas = null;
let activeDrawCanvas = null;
let activeBrush = "pen";         // pen | brush | marker | eraser
let brushSize    = 8;
let brushOpacity = 1.0;
let brushColor   = "#e74c3c";

// Export format
let exportFormat  = "png";
let exportQuality = 0.9;

// History (undo/redo)
const MAX_HISTORY = 20;
let history     = [];            // array of ImageData snapshots of originalImage
let historyIdx  = -1;

// Crop state
let isCropping  = false;
let cropRect    = { x: 0, y: 0, w: 0, h: 0 };
let cropDragging = null;         // 'move' | 'nw' | 'ne' | 'sw' | 'se' | null
let cropStart   = { x: 0, y: 0 };
let uncroppedBaseImage = null;   // The uncropped base image kept in memory
let cropRectInBase     = null;   // Bounding box of crop relative to uncroppedBaseImage
let baseDrawCanvasSplit = document.createElement('canvas'); // Persistent memory canvas (split)
let baseDrawCanvasEdit  = document.createElement('canvas'); // Persistent memory canvas (edit)

// Rotation preview (slider – not yet baked)
let rotationPreview = 0;

// Zoom & Pan state
let zoomScale = 1.0;
let zoomPanX = 0;
let zoomPanY = 0;
let spacePressed = false;

// Scrollbars drag state
let isDraggingThumbH = false;
let isDraggingThumbV = false;
let startThumbMouseX = 0;
let startThumbMouseY = 0;
let startThumbLeft = 0;
let startThumbTop = 0;

// ---------------------------------------------------------------------------
// 2. DOM REFERENCES
// ---------------------------------------------------------------------------

const dropZone          = document.getElementById('drop-zone');
const fileInput         = document.getElementById('file-input');
const emptyState        = document.getElementById('empty-state');
const imageViewer       = document.getElementById('image-viewer');
const btnSave           = document.getElementById('btn-save');
const btnReset          = document.getElementById('btn-reset');
const btnChangeImage    = document.getElementById('btn-change-image');

const fileNameText  = document.getElementById('file-name-text');
const fileSizeText  = document.getElementById('file-size-text');
const tabSplit = document.getElementById('tab-split');
const tabEdit  = document.getElementById('tab-edit');
const viewSplit = document.getElementById('view-split');
const viewEdit  = document.getElementById('view-edit');

// Image layers
const imgOriginalSplit    = document.getElementById('img-original-split');
const canvasFilteredSplit = document.getElementById('canvas-filtered-split');
const drawCanvasSplit     = document.getElementById('draw-canvas-split');
const imgReferenceEdit    = document.getElementById('img-reference-edit');
const canvasFilteredEdit  = document.getElementById('canvas-filtered-edit');
const drawCanvasEdit      = document.getElementById('draw-canvas-edit');

// Comparison slider
const comparisonSlider = document.getElementById('comparison-slider');
const filteredWrapper  = document.getElementById('filtered-wrapper');
const sliderHandle     = document.getElementById('slider-handle');

// Filter sliders
const sliderBlurContainer    = document.getElementById('slider-blur-container');
const sliderBlur             = document.getElementById('slider-blur');
const inputBlur              = document.getElementById('input-blur');
const sliderOpacityContainer = document.getElementById('slider-opacity-container');
const sliderOpacity          = document.getElementById('slider-opacity');
const inputOpacity           = document.getElementById('input-opacity');

// Adjustment sliders
const sliderBrightness = document.getElementById('slider-brightness');
const inputBrightness = document.getElementById('input-brightness');
const sliderContrast   = document.getElementById('slider-contrast');
const inputContrast    = document.getElementById('input-contrast');
const sliderSaturation = document.getElementById('slider-saturation');
const inputSaturation  = document.getElementById('input-saturation');

const filterCards = document.querySelectorAll('.filter-item');

// Sidebar tabs
const sidebarTabs   = document.querySelectorAll('.sidebar-tab');
const sidebarPanels = document.querySelectorAll('.sidebar-panel');

// Toolbar
const historyToolbar = document.getElementById('history-toolbar');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

// Draw panel
const brushBtns         = document.querySelectorAll('.brush-btn');
const brushSizeSlider   = document.getElementById('brush-size-slider');
const inputBrushSize    = document.getElementById('input-brush-size');
const brushOpacitySlider = document.getElementById('brush-opacity-slider');
const inputBrushOpacity = document.getElementById('input-brush-opacity');
const brushColorPicker  = document.getElementById('brush-color-picker');
const colorPresets      = document.querySelectorAll('.color-preset');
const btnClearDraw      = document.getElementById('btn-clear-draw');

// Transform panel

const btnFlipH          = document.getElementById('btn-flip-h');
const btnFlipV          = document.getElementById('btn-flip-v');
const sliderRotation    = document.getElementById('slider-rotation');
const inputRotation     = document.getElementById('input-rotation');
const btnRotationApply  = document.getElementById('btn-rotation-apply');
const btnCropStart      = document.getElementById('btn-crop-start');
const btnCropApply      = document.getElementById('btn-crop-apply');
const btnCropCancel     = document.getElementById('btn-crop-cancel');
const cropOverlay       = document.getElementById('crop-overlay');
const cropSelection     = document.getElementById('crop-selection');
const resizeWidth       = document.getElementById('resize-width');
const resizeHeight      = document.getElementById('resize-height');
const resizeKeepRatio   = document.getElementById('resize-keep-ratio');
const btnResizeApply    = document.getElementById('btn-resize-apply');

// Export
const formatBtns           = document.querySelectorAll('.format-btn');
const qualitySliderContainer = document.getElementById('quality-slider-container');
const exportQualitySlider  = document.getElementById('export-quality');
const inputExportQuality   = document.getElementById('input-export-quality');

// Modal
const appModal        = document.getElementById('app-modal');
const modalTitle      = document.getElementById('modal-title');
const modalMessage    = document.getElementById('modal-message');
const modalClose      = document.getElementById('modal-close');
const modalBtnCancel  = document.getElementById('modal-btn-cancel');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
let modalResolver = null;

// Controls sections (for disabled state)
const controlsSection   = document.getElementById('controls-section');
const drawControls      = document.getElementById('draw-controls');
const transformControls = document.getElementById('transform-controls');

// Filter layers DOM elements
const filterLayersPanel = document.getElementById('filter-layers-panel');
const filterLayersList  = document.getElementById('filter-layers-list');
const btnToggleLayers   = document.getElementById('btn-toggle-layers-panel');


// ---------------------------------------------------------------------------
// 3. MODAL HELPERS
// ---------------------------------------------------------------------------

function showAlert(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalBtnCancel.style.display = 'none';
        modalBtnConfirm.textContent = 'OK';
        appModal.classList.remove('hidden');
        modalResolver = (result) => { appModal.classList.add('hidden'); resolve(result); };
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalBtnCancel.style.display = 'block';
        modalBtnCancel.textContent = 'Annuler';
        modalBtnConfirm.textContent = 'Confirmer';
        appModal.classList.remove('hidden');
        modalResolver = (result) => { appModal.classList.add('hidden'); resolve(result); };
    });
}

modalClose.addEventListener('click',      () => { if (modalResolver) modalResolver(false); });
modalBtnCancel.addEventListener('click',  () => { if (modalResolver) modalResolver(false); });
modalBtnConfirm.addEventListener('click', () => { if (modalResolver) modalResolver(true); });
appModal.addEventListener('click', (e) => { if (e.target === appModal && modalResolver) modalResolver(false); });


// ---------------------------------------------------------------------------
// 5. SIDEBAR TAB SWITCHING
// ---------------------------------------------------------------------------

sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        sidebarTabs.forEach(t => t.classList.remove('active'));
        sidebarPanels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.panel);
        if (target) target.classList.add('active');
    });
});


// ---------------------------------------------------------------------------
// 6. FILE LOADING (drag & drop, click, paste)
// ---------------------------------------------------------------------------

['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); }, false);
});
['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); }, false);
});

dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

const appWorkspace = document.getElementById('app-workspace');
['dragenter', 'dragover'].forEach(evt => appWorkspace.addEventListener(evt, e => e.preventDefault(), false));
appWorkspace.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

btnChangeImage.addEventListener('click', () => fileInput.click());

window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            originalFileName = "image-collee";
            handleFile(blob);
            break;
        }
    }
});

async function handleFile(file) {
    if (!file.type.match('image.*')) {
        await showAlert("Format non supporté", "Veuillez sélectionner un fichier image valide (PNG, JPEG, BMP, WebP, GIF).");
        return;
    }

    let displayName = "Image";
    if (file.name) {
        originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        displayName = file.name;
    } else {
        originalFileName = "image-collee";
        displayName = "image_collee.png";
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            uncroppedBaseImage = img;
            cropRectInBase = null;

            fileNameText.textContent = displayName;
            fileSizeText.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            resizeWidth.value  = img.naturalWidth;
            resizeHeight.value = img.naturalHeight;
            btnChangeImage.style.display = 'block';

            let loadedCount = 0;
            const onInitLoaded = () => {
                loadedCount++;
                if (loadedCount >= 2) {
                    setTimeout(() => {
                        resizeComparisonContainer();
                        syncDrawCanvasSize();
                        processFilter();
                    }, 50);
                    imgOriginalSplit.onload = null;
                    imgReferenceEdit.onload = null;
                }
            };
            imgOriginalSplit.onload = onInitLoaded;
            imgReferenceEdit.onload = onInitLoaded;

            imgOriginalSplit.src = event.target.result;
            imgReferenceEdit.src = event.target.result;

            emptyState.classList.add('hidden');
            imageViewer.classList.remove('hidden');
            controlsSection.classList.remove('disabled');
            drawControls.classList.remove('disabled');
            transformControls.classList.remove('disabled');
            historyToolbar.classList.remove('hidden');
            btnSave.disabled  = false;
            btnReset.disabled = false;

            // Clear and size persistent memory canvases
            baseDrawCanvasSplit.width = img.naturalWidth;
            baseDrawCanvasSplit.height = img.naturalHeight;
            baseDrawCanvasSplit.getContext('2d').clearRect(0, 0, baseDrawCanvasSplit.width, baseDrawCanvasSplit.height);

            baseDrawCanvasEdit.width = img.naturalWidth;
            baseDrawCanvasEdit.height = img.naturalHeight;
            baseDrawCanvasEdit.getContext('2d').clearRect(0, 0, baseDrawCanvasEdit.width, baseDrawCanvasEdit.height);

            // Clear draw canvases
            clearDrawCanvas(drawCanvasSplit);
            clearDrawCanvas(drawCanvasEdit);

            resetFilterSelection();
            resetAdjustments();
            resetRotationPreview();
            resetZoomAndPan();
            pushHistory();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function resetFilterSelection() {
    activeFilters = ["Aucun"];
    filterCards.forEach(card => {
        card.classList.remove('active');
        if (card.dataset.filter === "Aucun") card.classList.add('active');
    });
    sliderBlurContainer.classList.add('hidden');
    sliderOpacityContainer.classList.add('hidden');
    
    // Reset inputs and sliders to default values
    if (sliderBlur) sliderBlur.value = 5;
    if (inputBlur) inputBlur.value = 5;
    if (sliderOpacity) sliderOpacity.value = 255;
    if (inputOpacity) inputOpacity.value = 100;

    updateFilterLayersUI();
}

function resetAdjustments() {
    brightness = 0; contrast = 0; saturation = 0;
    if (sliderBrightness) sliderBrightness.value = 0;
    if (inputBrightness) inputBrightness.value = 0;
    if (sliderContrast) sliderContrast.value = 0;
    if (inputContrast) inputContrast.value = 0;
    if (sliderSaturation) sliderSaturation.value = 0;
    if (inputSaturation) inputSaturation.value = 0;
}


// ---------------------------------------------------------------------------
// 7. VIEWER TABS & RESIZE
// ---------------------------------------------------------------------------

tabEdit.addEventListener('click', () => {
    tabEdit.classList.add('active');
    tabSplit.classList.remove('active');
    viewEdit.classList.remove('hidden');
    viewSplit.classList.add('hidden');
    
    processFilter();
    syncDrawCanvasSize();
});

tabSplit.addEventListener('click', () => {
    tabSplit.classList.add('active');
    tabEdit.classList.remove('active');
    viewSplit.classList.remove('hidden');
    viewEdit.classList.add('hidden');
    
    resizeComparisonContainer();
    syncDrawCanvasSize();
});

window.addEventListener('resize', () => {
    if (originalImage) {
        resizeComparisonContainer();
        syncDrawCanvasSize();
    }
});

// Helper to synchronize drawings between two canvases (scaling automatically)
function syncDrawings(fromCanvas, toCanvas) {
    if (fromCanvas.width === 0 || fromCanvas.height === 0 || toCanvas.width === 0 || toCanvas.height === 0) return;
    const ctx = toCanvas.getContext('2d');
    ctx.save();
    ctx.imageSmoothingEnabled = true; // Use smoothing to prevent pixelation
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, toCanvas.width, toCanvas.height);
    ctx.drawImage(fromCanvas, 0, 0, toCanvas.width, toCanvas.height);
    ctx.restore();
}

function resizeComparisonContainer() {
    if (!originalImage || viewSplit.classList.contains('hidden')) return;
    const w = imgOriginalSplit.clientWidth;
    const h = imgOriginalSplit.clientHeight;
    if (w > 0 && h > 0) {
        comparisonSlider.style.width  = w + 'px';
        comparisonSlider.style.height = h + 'px';
        canvasFilteredSplit.style.width  = w + 'px';
        canvasFilteredSplit.style.height = h + 'px';
        drawCanvasSplit.style.width  = w + 'px';
        drawCanvasSplit.style.height = h + 'px';
        updateSliderPosition(50);
        processFilter();
    }
}

function syncDrawCanvasSize() {
    if (!originalImage) return;
    const imgToDraw = isCropping ? uncroppedBaseImage : originalImage;

    if (!viewSplit.classList.contains('hidden')) {
        const w = imgOriginalSplit.clientWidth  || imgToDraw.width;
        const h = imgOriginalSplit.clientHeight || imgToDraw.height;
        drawCanvasSplit.width  = w;
        drawCanvasSplit.height = h;
    } else {
        const w = imgReferenceEdit.clientWidth  || imgToDraw.width;
        const h = imgReferenceEdit.clientHeight || imgToDraw.height;
        drawCanvasEdit.width  = w;
        drawCanvasEdit.height = h;
    }
    
    // Load persistent memory drawings onto screen canvases at correct layout scale
    loadDrawingsToScreen();
}


// ---------------------------------------------------------------------------
// 8. COMPARISON SLIDER DRAG
// ---------------------------------------------------------------------------

let isDragging = false;

sliderHandle.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
window.addEventListener('mouseup',   () => { isDragging = false; });
window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = comparisonSlider.getBoundingClientRect();
    let offsetX = e.clientX - rect.left;
    offsetX = Math.max(0, Math.min(offsetX, rect.width));
    updateSliderPosition((offsetX / rect.width) * 100);
});

sliderHandle.addEventListener('touchstart', (e) => { isDragging = true; }, { passive: true });
window.addEventListener('touchend',  () => { isDragging = false; });
window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const rect = comparisonSlider.getBoundingClientRect();
    let offsetX = e.touches[0].clientX - rect.left;
    offsetX = Math.max(0, Math.min(offsetX, rect.width));
    updateSliderPosition((offsetX / rect.width) * 100);
}, { passive: true });

function updateSliderPosition(percent) {
    filteredWrapper.style.width = percent + '%';
    sliderHandle.style.left     = percent + '%';
}


// ---------------------------------------------------------------------------
// 9. FILTER PANEL
// ---------------------------------------------------------------------------

filterCards.forEach(card => {
    card.addEventListener('click', () => {
        const filter = card.dataset.filter;
        
        if (filter === "Aucun") {
            activeFilters = ["Aucun"];
            filterCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        } else {
            // Si "Aucun" était actif, on le retire
            const noneIdx = activeFilters.indexOf("Aucun");
            if (noneIdx !== -1) {
                activeFilters.splice(noneIdx, 1);
                const cardAucun = Array.from(filterCards).find(c => c.dataset.filter === "Aucun");
                if (cardAucun) cardAucun.classList.remove('active');
            }
            
            const filterIdx = activeFilters.indexOf(filter);
            if (filterIdx !== -1) {
                activeFilters.splice(filterIdx, 1);
                card.classList.remove('active');
            } else {
                activeFilters.push(filter);
                card.classList.add('active');
            }
            
            // Si aucun filtre n'est sélectionné, on remet "Aucun"
            if (activeFilters.length === 0) {
                activeFilters = ["Aucun"];
                const cardAucun = Array.from(filterCards).find(c => c.dataset.filter === "Aucun");
                if (cardAucun) cardAucun.classList.add('active');
            }
        }

        // Gérer la visibilité des sliders
        if (activeFilters.includes("Flou")) {
            sliderBlurContainer.classList.remove('hidden');
        } else {
            sliderBlurContainer.classList.add('hidden');
        }
        
        if (activeFilters.includes("Opacité")) {
            sliderOpacityContainer.classList.remove('hidden');
        } else {
            sliderOpacityContainer.classList.add('hidden');
        }

        updateFilterLayersUI();
        processFilter();
    });
});

// UI management for layers list
let draggedIndex = null;

function updateFilterLayersUI() {
    if (!filterLayersPanel || !filterLayersList) return;
    const list = activeFilters.filter(f => f !== "Aucun");
    
    if (list.length >= 1) {
        filterLayersPanel.classList.remove('hidden');
    } else {
        filterLayersPanel.classList.add('hidden');
    }
    
    filterLayersList.innerHTML = "";
    
    list.forEach((filter, index) => {
        const item = document.createElement('div');
        item.className = "filter-layer-item";
        
        const nameSpan = document.createElement('span');
        nameSpan.className = "filter-layer-name";
        nameSpan.textContent = `${index + 1}. ${filter}`;
        item.appendChild(nameSpan);
        
        // Bouton Supprimer
        const btnDel = document.createElement('button');
        btnDel.className = "filter-layer-delete";
        btnDel.innerHTML = "✕";
        btnDel.title = "Supprimer le filtre";
        btnDel.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering drag event on delete click
            removeFilterFromList(filter);
        });
        item.appendChild(btnDel);
        
        // Setup Drag and Drop
        setupDragAndDrop(item, index);
        
        filterLayersList.appendChild(item);
    });
}

function setupDragAndDrop(item, index) {
    item.setAttribute('draggable', 'true');
    
    item.addEventListener('dragstart', (e) => {
        draggedIndex = index;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
    });
    
    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedIndex = null;
        const items = filterLayersList.querySelectorAll('.filter-layer-item');
        items.forEach(it => it.classList.remove('drag-over'));
    });
    
    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
    });
    
    item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
    });
    
    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        
        const fromIndex = draggedIndex;
        const toIndex = index;
        
        if (fromIndex !== null && fromIndex !== toIndex) {
            reorderFilters(fromIndex, toIndex);
        }
    });
}

function reorderFilters(fromIndex, toIndex) {
    const list = activeFilters.filter(f => f !== "Aucun");
    
    // Deplace l'element dans la liste
    const [movedItem] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, movedItem);
    
    activeFilters = list;
    updateFilterLayersUI();
    processFilter();
}

function removeFilterFromList(filter) {
    const idx = activeFilters.indexOf(filter);
    if (idx !== -1) {
        activeFilters.splice(idx, 1);
        
        // Décocher le bouton dans la liste principale
        const card = Array.from(filterCards).find(c => c.dataset.filter === filter);
        if (card) card.classList.remove('active');
        
        if (activeFilters.length === 0) {
            activeFilters = ["Aucun"];
            const cardAuxun = Array.from(filterCards).find(c => c.dataset.filter === "Aucun");
            if (cardAuxun) cardAuxun.classList.add('active');
        }
        
        // Masquer les sliders si nécessaire
        if (!activeFilters.includes("Flou")) sliderBlurContainer.classList.add('hidden');
        if (!activeFilters.includes("Opacité")) sliderOpacityContainer.classList.add('hidden');
        
        updateFilterLayersUI();
        processFilter();
    }
}

// Helper to bind a slider range input and a number input bidirectionally
function bindSliderAndInput(slider, input, updateFn, isPercentOpacity = false) {
    if (!slider || !input) return;

    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (isPercentOpacity) {
            input.value = Math.round((val / 255) * 100);
        } else {
            input.value = val;
        }
        updateFn(val);
    });

    input.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) {
            if (isPercentOpacity) {
                input.value = Math.round((parseFloat(slider.value) / 255) * 100);
            } else {
                input.value = parseFloat(slider.value);
            }
            return;
        }

        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        if (!isNaN(min) && val < min) val = min;
        if (!isNaN(max) && val > max) val = max;

        input.value = val;
        let sliderVal = val;
        if (isPercentOpacity) {
            sliderVal = Math.round((val / 100) * 255);
        }
        slider.value = sliderVal;
        updateFn(sliderVal);
    });

    input.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) return;

        let sliderVal = val;
        if (isPercentOpacity) {
            sliderVal = Math.round((val / 100) * 255);
        }
        const sliderMin = parseFloat(slider.min) || 0;
        const sliderMax = parseFloat(slider.max) || 255;
        if (sliderVal >= sliderMin && sliderVal <= sliderMax) {
            slider.value = sliderVal;
            updateFn(sliderVal);
        }
    });
}

// Bind Filter Sliders
bindSliderAndInput(sliderBlur, inputBlur, (val) => {
    processFilter();
});

bindSliderAndInput(sliderOpacity, inputOpacity, (val) => {
    processFilter();
}, true);

// Bind Adjustment Sliders
bindSliderAndInput(sliderBrightness, inputBrightness, (val) => {
    brightness = val;
    processFilter();
});
bindSliderAndInput(sliderContrast, inputContrast, (val) => {
    contrast = val;
    processFilter();
});
bindSliderAndInput(sliderSaturation, inputSaturation, (val) => {
    saturation = val;
    processFilter();
});


// ---------------------------------------------------------------------------
// 10. FILTER ENGINE
// ---------------------------------------------------------------------------

function processFilter() {
    if (!originalImage || !uncroppedBaseImage) return;

    const isSplit = !viewSplit.classList.contains('hidden');
    const targetCanvas = isSplit ? canvasFilteredSplit : canvasFilteredEdit;
    const refImage     = isSplit ? imgOriginalSplit    : imgReferenceEdit;

    const imgToDraw = isCropping ? uncroppedBaseImage : originalImage;

    const w = refImage.clientWidth  || imgToDraw.width;
    const h = refImage.clientHeight || imgToDraw.height;

    targetCanvas.width  = w;
    targetCanvas.height = h;

    const ctx = targetCanvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    applyFiltersToContext(ctx, imgToDraw, w, h,
        activeFilters,
        parseFloat(sliderBlur.value),
        parseInt(sliderOpacity.value));
}

function applyFiltersToContext(ctx, img, width, height, filters, blur, opacity) {
    // 1. Draw base image (without filters)
    ctx.drawImage(img, 0, 0, width, height);

    // 2. Apply each active filter sequentially in the exact list order
    for (const filterType of filters) {
        if (filterType === "Aucun") continue;

        if (filterType === "Flou") {
            // Create temporary canvas to copy current state
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(ctx.canvas, 0, 0);

            // Clear destination and redraw with blur filter
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            ctx.filter = `blur(${blur}px)`;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
        } 
        else if (filterType === "Opacité") {
            // Create temporary canvas to copy current state
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(ctx.canvas, 0, 0);

            // Clear destination and redraw with opacity alpha
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            ctx.globalAlpha = opacity / 255;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
        } 
        else {
            // Pixel-based filters
            let imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;
            const len  = data.length;

            switch (filterType) {
                case "Noir & Blanc":
                    for (let i = 0; i < len; i += 4) {
                        const lum = 0.2989 * data[i] + 0.5870 * data[i+1] + 0.1140 * data[i+2];
                        const val = lum > 128 ? 255 : 0;
                        data[i] = data[i+1] = data[i+2] = val;
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Sépia":
                    for (let i = 0; i < len; i += 4) {
                        const r = data[i], g = data[i+1], b = data[i+2];
                        data[i]   = Math.min(255, 0.393*r + 0.769*g + 0.189*b);
                        data[i+1] = Math.min(255, 0.349*r + 0.686*g + 0.168*b);
                        data[i+2] = Math.min(255, 0.272*r + 0.534*g + 0.131*b);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Vert":
                    for (let i = 0; i < len; i += 4) {
                        data[i]   = Math.max(0, data[i]   - 75);
                        data[i+1] = Math.min(255, data[i+1] + 75);
                        data[i+2] = Math.max(0, data[i+2] - 75);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Rouge":
                    for (let i = 0; i < len; i += 4) {
                        data[i]   = Math.min(255, data[i]   + 75);
                        data[i+1] = Math.max(0, data[i+1] - 75);
                        data[i+2] = Math.max(0, data[i+2] - 75);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Bleu":
                    for (let i = 0; i < len; i += 4) {
                        data[i]   = Math.max(0, data[i]   - 75);
                        data[i+1] = Math.max(0, data[i+1] - 75);
                        data[i+2] = Math.min(255, data[i+2] + 75);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Nuance de Gris":
                    for (let i = 0; i < len; i += 4) {
                        const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                        data[i] = data[i+1] = data[i+2] = avg;
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Négatif":
                    for (let i = 0; i < len; i += 4) {
                        data[i]   = 255 - data[i];
                        data[i+1] = 255 - data[i+1];
                        data[i+2] = 255 - data[i+2];
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Contours":
                    ctx.putImageData(applySobel(imgData), 0, 0);
                    break;
                case "Vivid":
                    for (let i = 0; i < len; i += 4) {
                        data[i]   = Math.min(255, data[i]   * 1.2);
                        data[i+1] = Math.min(255, data[i+1] * 1.15);
                        data[i+2] = Math.min(255, data[i+2] * 0.85);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Cinématique":
                    for (let i = 0; i < len; i += 4) {
                        const r = data[i], g = data[i+1], b = data[i+2];
                        data[i]   = Math.min(255, r * 0.9 + 20);
                        data[i+1] = Math.min(255, g * 0.85 + 10);
                        data[i+2] = Math.min(255, b * 1.1);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
                case "Aquarelle":
                    for (let i = 0; i < len; i += 4) {
                        const r = data[i], g = data[i+1], b = data[i+2];
                        const lum = 0.2989*r + 0.5870*g + 0.1140*b;
                        data[i]   = Math.min(255, r * 0.6 + lum * 0.5 + 30);
                        data[i+1] = Math.min(255, g * 0.6 + lum * 0.5 + 30);
                        data[i+2] = Math.min(255, b * 0.8 + lum * 0.3 + 50);
                    }
                    ctx.putImageData(imgData, 0, 0);
                    break;
            }
        }
    }

    // 3. Apply brightness/contrast/saturation adjustments at the very end
    applyAdjustments(ctx, width, height);
}

// Brightness, Contrast, Saturation adjustments
function applyAdjustments(ctx, width, height) {
    if (brightness === 0 && contrast === 0 && saturation === 0) return;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len  = data.length;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < len; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];

        // Brightness
        r += brightness; g += brightness; b += brightness;

        // Contrast
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;

        // Saturation (via HSL-like approach)
        if (saturation !== 0) {
            const avg = (r + g + b) / 3;
            const s   = saturation / 100;
            r = avg + (r - avg) * (1 + s);
            g = avg + (g - avg) * (1 + s);
            b = avg + (b - avg) * (1 + s);
        }

        data[i]   = Math.max(0, Math.min(255, r));
        data[i+1] = Math.max(0, Math.min(255, g));
        data[i+2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imgData, 0, 0);
}

// Sobel edge detection
function applySobel(imgData) {
    const width = imgData.width, height = imgData.height;
    const data  = imgData.data;
    const output = new Uint8ClampedArray(data.length);
    const kX = [-1,0,1,-2,0,2,-1,0,1];
    const kY = [-1,-2,-1,0,0,0,1,2,1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let pX = 0, pY = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx  = ((y+ky)*width + (x+kx)) * 4;
                    const val  = 0.2989*data[idx] + 0.5870*data[idx+1] + 0.1140*data[idx+2];
                    const kidx = (ky+1)*3 + (kx+1);
                    pX += val * kX[kidx];
                    pY += val * kY[kidx];
                }
            }
            const mag = Math.sqrt(pX*pX + pY*pY);
            const outIdx = (y*width + x) * 4;
            const finalVal = Math.min(255, mag);
            output[outIdx] = output[outIdx+1] = output[outIdx+2] = finalVal;
            output[outIdx+3] = 255;
        }
    }
    for (let i = 0; i < output.length; i += 4) {
        if (output[i+3] === 0) output[i+3] = 255;
    }
    return new ImageData(output, width, height);
}


// ---------------------------------------------------------------------------
// 11. DRAWING MODULE
// ---------------------------------------------------------------------------

function getActiveDrawCanvas() {
    return viewSplit.classList.contains('hidden') ? drawCanvasEdit : drawCanvasSplit;
}

function getScaleFactors() {
    // Returns scale from displayed canvas pixels to naturalImage pixels
    const canvas = getActiveDrawCanvas();
    const scaleX = originalImage ? originalImage.naturalWidth  / canvas.width  : 1;
    const scaleY = originalImage ? originalImage.naturalHeight / canvas.height : 1;
    return { scaleX, scaleY };
}

// Wire up pointer events on both draw canvases
[drawCanvasSplit, drawCanvasEdit].forEach(canvas => {
    // Prevent context menu (right click) on the drawing canvas to allow right-click erasing
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    }, false);

    canvas.addEventListener('mousedown', (e) => {
        onDrawStart(e, canvas);
    }, false);

    canvas.addEventListener('mouseenter', (e) => {
        lastHoveredCanvas = canvas;
        if (isDrawing && activeDrawCanvas === canvas) {
            updateBrushPreview(e, canvas);
        } else if (!isDrawing) {
            updateBrushPreview(e, canvas);
        }
    }, false);

    canvas.addEventListener('mouseleave', (e) => {
        if (!isDrawing) {
            lastHoveredCanvas = null;
            hideBrushPreview();
        }
    }, false);

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onDrawEnd,    { passive: false });
});

// Global window mousemove/mouseup to handle drawing outside and proper tool preview
window.addEventListener('mousemove', (e) => {
    if (isDrawing) {
        onDrawMove(e);
    } else {
        // If not drawing, update preview only when hovering a draw canvas
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (element && (element === drawCanvasSplit || element === drawCanvasEdit)) {
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            lastHoveredCanvas = element;
            updateBrushPreview(e, element);
        } else {
            if (lastHoveredCanvas) {
                lastHoveredCanvas = null;
                hideBrushPreview();
            }
        }
    }
}, false);

window.addEventListener('mouseup', (e) => {
    if (isDrawing) {
        onDrawEnd();
    }
}, false);

function canvasCoords(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Pointer position relative to center
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    // Rotate the point back by -rotationPreview degrees
    const rad = (-rotationPreview * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    // Scale back by the zoomScale factor
    const rxScaled = rx / zoomScale;
    const ryScaled = ry / zoomScale;

    // Translate back to top-left of unrotated canvas layout
    const unrotatedWidth = canvas.clientWidth || canvas.width;
    const unrotatedHeight = canvas.clientHeight || canvas.height;
    const localX = rxScaled + unrotatedWidth / 2;
    const localY = ryScaled + unrotatedHeight / 2;

    // Scale to internal canvas dimensions
    const scaleX = canvas.width / unrotatedWidth;
    const scaleY = canvas.height / unrotatedHeight;

    return {
        x: localX * scaleX,
        y: localY * scaleY
    };
}

function onDrawStart(e, canvas) {
    if (!originalImage || isCropping) return;
    // Allow left click (0) and right click (2)
    if (e.button !== undefined && e.button !== 0 && e.button !== 2) return;
    
    isDrawing = true;
    isRightClickDrawing = (e.button === 2);
    activeDrawCanvas = canvas || e.currentTarget;

    const { x, y } = canvasCoords(activeDrawCanvas, e);
    lastX = x; lastY = y;

    // For single-dot click
    drawStroke(activeDrawCanvas, x, y, x, y);

    // Update preview position
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastHoveredCanvas = activeDrawCanvas;
    updateBrushPreview(e, activeDrawCanvas);
}

function onDrawMove(e) {
    if (!isDrawing || !originalImage || isCropping || !activeDrawCanvas) return;

    // Verify mouse buttons if this is a mouse event and not a touch event
    if (e.buttons !== undefined) {
        const holdingLeft = (e.buttons & 1) !== 0;
        const holdingRight = (e.buttons & 2) !== 0;
        if (!holdingLeft && !holdingRight) {
            onDrawEnd();
            return;
        }
    }
    
    const { x, y } = canvasCoords(activeDrawCanvas, e);
    drawStroke(activeDrawCanvas, lastX, lastY, x, y);
    lastX = x; lastY = y;

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastHoveredCanvas = activeDrawCanvas;
    updateBrushPreview(e, activeDrawCanvas);
}

function onDrawEnd() {
    if (isDrawing) {
        isDrawing = false;
        isRightClickDrawing = false;
        
        const active = getActiveDrawCanvas();
        const other = (active === drawCanvasEdit) ? drawCanvasSplit : drawCanvasEdit;
        
        // Sync the screen canvases (if the other is visible/non-zero size)
        syncDrawings(active, other);

        // Update the active persistent memory canvas from the active screen canvas
        const activeBase = (active === drawCanvasEdit) ? baseDrawCanvasEdit : baseDrawCanvasSplit;
        const otherBase = (active === drawCanvasEdit) ? baseDrawCanvasSplit : baseDrawCanvasEdit;

        const hdActive = getHDDrawCanvas(active); // Safe since active screen canvas is guaranteed to have size > 0

        if (!cropRectInBase) {
            activeBase.width = hdActive.width;
            activeBase.height = hdActive.height;
            const ctx = activeBase.getContext('2d');
            ctx.clearRect(0, 0, activeBase.width, activeBase.height);
            ctx.drawImage(hdActive, 0, 0);
        } else {
            const ctx = activeBase.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.clearRect(cropRectInBase.x, cropRectInBase.y, cropRectInBase.w, cropRectInBase.h);
            ctx.drawImage(hdActive, cropRectInBase.x, cropRectInBase.y);
        }

        // Synchronize the other persistent base canvas from the active one
        otherBase.width = activeBase.width;
        otherBase.height = activeBase.height;
        const otherCtx = otherBase.getContext('2d');
        otherCtx.clearRect(0, 0, otherBase.width, otherBase.height);
        otherCtx.drawImage(activeBase, 0, 0);

        pushHistory();
        hideBrushPreview();
        activeDrawCanvas = null;
    }
}

function updateBrushPreview(e, canvas) {
    const preview = document.getElementById('brush-preview-cursor');
    if (!preview) return;

    // Only show preview if the draw panel is active, we are not cropping, and an image is loaded
    const drawPanel = document.getElementById('panel-draw');
    const isDrawPanelActive = drawPanel && drawPanel.classList.contains('active');
    if (!originalImage || isCropping || !isDrawPanelActive) {
        preview.style.display = 'none';
        return;
    }

    // Determine current active brush type
    const currentBrushType = (isDrawing && isRightClickDrawing) ? 'eraser' : activeBrush;

    // Get stroke width in canvas pixels
    let strokeWidth = brushSize;
    if (currentBrushType === 'brush' || currentBrushType === 'eraser') {
        strokeWidth = brushSize * 2;
    } else if (currentBrushType === 'marker') {
        strokeWidth = brushSize * 3;
    }

    // Convert to screen pixels by scaling with zoomScale
    const diameter = strokeWidth * zoomScale;

    // Update styling
    preview.style.width = diameter + 'px';
    preview.style.height = diameter + 'px';
    preview.style.left = e.clientX + 'px';
    preview.style.top = e.clientY + 'px';
    preview.style.display = 'block';

    // Different color for eraser vs drawing pens
    if (currentBrushType === 'eraser') {
        preview.style.borderColor = 'rgba(231, 76, 60, 0.95)'; // Red border for eraser
        preview.style.backgroundColor = 'rgba(231, 76, 60, 0.15)';
    } else {
        preview.style.borderColor = 'rgba(255, 255, 255, 0.9)'; // White border for brush
        preview.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    }
}

function hideBrushPreview() {
    const preview = document.getElementById('brush-preview-cursor');
    if (preview) {
        preview.style.display = 'none';
    }
}

function refreshBrushPreview() {
    if (lastHoveredCanvas) {
        updateBrushPreview({ clientX: lastMouseX, clientY: lastMouseY }, lastHoveredCanvas);
    }
}

// Quick comparison features removed by user request

function onTouchStart(e) {
    e.preventDefault();
    if (!originalImage || isCropping) return;
    const touch = e.touches[0];
    onDrawStart({ currentTarget: e.currentTarget, clientX: touch.clientX, clientY: touch.clientY });
}

function onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    onDrawMove({ currentTarget: e.currentTarget, clientX: touch.clientX, clientY: touch.clientY });
}

function drawStroke(canvas, x1, y1, x2, y2) {
    const ctx = canvas.getContext('2d');
    ctx.save();

    const currentBrushType = isRightClickDrawing ? 'eraser' : activeBrush;

    if (currentBrushType === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth   = brushSize * 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.shadowBlur  = 0;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = brushOpacity;

        switch (currentBrushType) {
            case 'pen':
                ctx.strokeStyle = brushColor;
                ctx.lineWidth   = brushSize;
                ctx.lineCap     = 'round';
                ctx.lineJoin    = 'round';
                ctx.shadowBlur  = 0;
                break;
            case 'brush':
                ctx.strokeStyle = brushColor;
                ctx.lineWidth   = brushSize * 2;
                ctx.lineCap     = 'round';
                ctx.lineJoin    = 'round';
                ctx.shadowColor = brushColor;
                ctx.shadowBlur  = brushSize * 1.5;
                break;
            case 'marker':
                ctx.strokeStyle = brushColor;
                ctx.lineWidth   = brushSize * 3;
                ctx.lineCap     = 'square';
                ctx.lineJoin    = 'bevel';
                ctx.shadowBlur  = 0;
                break;
        }
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function clearDrawCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function flipCanvas(canvas, horizontal) {
    if (canvas.width === 0 || canvas.height === 0) return;
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tempCtx = temp.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(horizontal ? canvas.width : 0, horizontal ? 0 : canvas.height);
    ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
}

function cropCanvasContent(canvas, cropRect, baseNaturalW, baseNaturalH) {
    if (canvas.width === 0 || canvas.height === 0 || !cropRect) return;
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    temp.getContext('2d').drawImage(canvas, 0, 0);

    const scaleX = canvas.width / baseNaturalW;
    const scaleY = canvas.height / baseNaturalH;

    const cx = cropRect.x * scaleX;
    const cy = cropRect.y * scaleY;
    const cw = cropRect.w * scaleX;
    const ch = cropRect.h * scaleY;

    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(temp, cx, cy, cw, ch, 0, 0, cw, ch);
}

function getFlippedCanvas(canvas, horizontal) {
    const flipped = document.createElement('canvas');
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
        flipped.width = Math.max(1, canvas ? canvas.width : 1);
        flipped.height = Math.max(1, canvas ? canvas.height : 1);
        return flipped;
    }
    flipped.width = canvas.width;
    flipped.height = canvas.height;
    const ctx = flipped.getContext('2d');
    ctx.save();
    ctx.translate(horizontal ? canvas.width : 0, horizontal ? 0 : canvas.height);
    ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
    try {
        ctx.drawImage(canvas, 0, 0);
    } catch (e) {
        console.error("Error in getFlippedCanvas drawImage:", e);
    }
    ctx.restore();
    return flipped;
}

function getHDDrawCanvas(canvas, naturalW, naturalH) {
    const hdCanvas = document.createElement('canvas');
    const w = naturalW || (originalImage ? originalImage.naturalWidth : canvas.width);
    const h = naturalH || (originalImage ? originalImage.naturalHeight : canvas.height);
    hdCanvas.width = Math.max(1, w);
    hdCanvas.height = Math.max(1, h);
    const ctx = hdCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
        try {
            ctx.drawImage(canvas, 0, 0, hdCanvas.width, hdCanvas.height);
        } catch (e) {
            console.error("Error in getHDDrawCanvas drawImage:", e);
        }
    }
    return hdCanvas;
}

function loadHDDrawingsToCanvas(splitDataURL, editDataURL) {
    if (splitDataURL) {
        const imgSplit = new Image();
        imgSplit.onload = () => {
            clearDrawCanvas(drawCanvasSplit);
            const ctx = drawCanvasSplit.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(imgSplit, 0, 0, drawCanvasSplit.width, drawCanvasSplit.height);
        };
        imgSplit.src = splitDataURL;
    } else {
        clearDrawCanvas(drawCanvasSplit);
    }

    if (editDataURL) {
        const imgEdit = new Image();
        imgEdit.onload = () => {
            clearDrawCanvas(drawCanvasEdit);
            const ctx = drawCanvasEdit.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(imgEdit, 0, 0, drawCanvasEdit.width, drawCanvasEdit.height);
        };
        imgEdit.src = editDataURL;
    } else {
        clearDrawCanvas(drawCanvasEdit);
    }
}

function loadDrawingsToScreen() {
    if (!originalImage) return;

    const wSplit = drawCanvasSplit.width;
    const hSplit = drawCanvasSplit.height;
    clearDrawCanvas(drawCanvasSplit);
    if (wSplit > 0 && hSplit > 0 && baseDrawCanvasSplit.width > 0 && baseDrawCanvasSplit.height > 0) {
        const ctxSplit = drawCanvasSplit.getContext('2d');
        ctxSplit.imageSmoothingEnabled = true;
        if (cropRectInBase) {
            ctxSplit.drawImage(baseDrawCanvasSplit, 
                cropRectInBase.x, cropRectInBase.y, cropRectInBase.w, cropRectInBase.h,
                0, 0, wSplit, hSplit);
        } else {
            ctxSplit.drawImage(baseDrawCanvasSplit, 0, 0, wSplit, hSplit);
        }
    }

    const wEdit = drawCanvasEdit.width;
    const hEdit = drawCanvasEdit.height;
    clearDrawCanvas(drawCanvasEdit);
    if (wEdit > 0 && hEdit > 0 && baseDrawCanvasEdit.width > 0 && baseDrawCanvasEdit.height > 0) {
        const ctxEdit = drawCanvasEdit.getContext('2d');
        ctxEdit.imageSmoothingEnabled = true;
        if (cropRectInBase) {
            ctxEdit.drawImage(baseDrawCanvasEdit, 
                cropRectInBase.x, cropRectInBase.y, cropRectInBase.w, cropRectInBase.h,
                0, 0, wEdit, hEdit);
        } else {
            ctxEdit.drawImage(baseDrawCanvasEdit, 0, 0, wEdit, hEdit);
        }
    }
}

function getDrawCanvasForExport() {
    // Returns a canvas with the drawing at natural image resolution
    const exportCanvas = document.createElement('canvas');
    if (!originalImage) return exportCanvas;
    
    exportCanvas.width  = originalImage.naturalWidth;
    exportCanvas.height = originalImage.naturalHeight;
    const ctx = exportCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // Use the active persistent memory canvas as source of truth
    const active = getActiveDrawCanvas();
    const baseCanvas = (active === drawCanvasEdit) ? baseDrawCanvasEdit : baseDrawCanvasSplit;

    if (baseCanvas.width > 0 && baseCanvas.height > 0) {
        try {
            if (cropRectInBase) {
                // If cropped, draw only the cropped region from base canvas
                ctx.drawImage(baseCanvas,
                    cropRectInBase.x, cropRectInBase.y, cropRectInBase.w, cropRectInBase.h,
                    0, 0, exportCanvas.width, exportCanvas.height);
            } else {
                // Draw the full base canvas
                ctx.drawImage(baseCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
            }
        } catch (e) {
            console.error("Error in getDrawCanvasForExport drawImage:", e);
        }
    }
    return exportCanvas;
}

// Brush panel controls
brushBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        brushBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeBrush = btn.dataset.brush;

        if (activeBrush === 'eraser') {
            document.body.classList.remove('draw-mode');
            document.body.classList.add('eraser-mode');
        } else {
            document.body.classList.add('draw-mode');
            document.body.classList.remove('eraser-mode');
        }
        refreshBrushPreview();
    });
});

bindSliderAndInput(brushSizeSlider, inputBrushSize, (val) => {
    brushSize = val;
    refreshBrushPreview();
});

bindSliderAndInput(brushOpacitySlider, inputBrushOpacity, (val) => {
    brushOpacity = val / 100;
});

brushColorPicker.addEventListener('input', (e) => {
    brushColor = e.target.value;
    colorPresets.forEach(p => p.classList.remove('active'));
});

colorPresets.forEach(preset => {
    preset.addEventListener('click', () => {
        brushColor = preset.dataset.color;
        brushColorPicker.value = brushColor;
        colorPresets.forEach(p => p.classList.remove('active'));
        preset.classList.add('active');
    });
});

btnClearDraw.addEventListener('click', async () => {
    const ok = await showConfirm("Effacer le dessin", "Voulez-vous effacer tout le dessin sur l'image ?");
    if (ok) {
        clearDrawCanvas(drawCanvasSplit);
        clearDrawCanvas(drawCanvasEdit);
        pushHistory();
    }
});

// Activate draw mode by default when Draw tab is selected
document.getElementById('stab-draw').addEventListener('click', () => {
    document.body.classList.add('draw-mode');
    document.body.classList.remove('eraser-mode');
});
document.getElementById('stab-filters').addEventListener('click', () => {
    document.body.classList.remove('draw-mode');
    document.body.classList.remove('eraser-mode');
});
document.getElementById('stab-transform').addEventListener('click', () => {
    document.body.classList.remove('draw-mode');
    document.body.classList.remove('eraser-mode');
});


// ---------------------------------------------------------------------------
// 12. TRANSFORM MODULE
// ---------------------------------------------------------------------------

function bakeImageToCanvas(img) {
    // Creates a canvas at natural image size and draws img on it
    const c = document.createElement('canvas');
    c.width  = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
}



function flipImage(horizontal) {
    if (!originalImage) return;
    
    // Flip full-resolution memory canvases synchronously
    baseDrawCanvasSplit = getFlippedCanvas(baseDrawCanvasSplit, horizontal);
    baseDrawCanvasEdit  = getFlippedCanvas(baseDrawCanvasEdit, horizontal);

    const src = bakeImageToCanvas(originalImage);
    const dst = document.createElement('canvas');
    dst.width  = src.width;
    dst.height = src.height;
    const ctx  = dst.getContext('2d');
    ctx.translate(horizontal ? src.width : 0, horizontal ? 0 : src.height);
    ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
    ctx.drawImage(src, 0, 0);

    const newImg = new Image();
    newImg.onload = () => {
        originalImage = newImg;
        
        // Also flip uncroppedBaseImage if it exists!
        if (uncroppedBaseImage) {
            const uSrc = bakeImageToCanvas(uncroppedBaseImage);
            const uDst = document.createElement('canvas');
            uDst.width = uSrc.width;
            uDst.height = uSrc.height;
            const uCtx = uDst.getContext('2d');
            uCtx.translate(horizontal ? uSrc.width : 0, horizontal ? 0 : uSrc.height);
            uCtx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
            uCtx.drawImage(uSrc, 0, 0);

            const newUImg = new Image();
            newUImg.onload = () => {
                uncroppedBaseImage = newUImg;
                if (cropRectInBase) {
                    if (horizontal) {
                        cropRectInBase.x = uncroppedBaseImage.naturalWidth - cropRectInBase.x - cropRectInBase.w;
                    } else {
                        cropRectInBase.y = uncroppedBaseImage.naturalHeight - cropRectInBase.y - cropRectInBase.h;
                    }
                }
                updateAfterTransform();
            };
            newUImg.src = uDst.toDataURL('image/png');
        } else {
            updateAfterTransform();
        }
    };
    newImg.src = dst.toDataURL('image/png');
}

function resizeImageTo(targetW, targetH) {
    if (!originalImage) return;

    // Resize full-resolution memory canvases synchronously to keep drawings aligned
    if (baseDrawCanvasSplit.width > 0 && baseDrawCanvasSplit.height > 0) {
        const resizedSplit = document.createElement('canvas');
        resizedSplit.width = targetW;
        resizedSplit.height = targetH;
        const ctxSplit = resizedSplit.getContext('2d');
        ctxSplit.imageSmoothingEnabled = true;
        ctxSplit.drawImage(baseDrawCanvasSplit, 0, 0, targetW, targetH);
        baseDrawCanvasSplit = resizedSplit;
    }

    if (baseDrawCanvasEdit.width > 0 && baseDrawCanvasEdit.height > 0) {
        const resizedEdit = document.createElement('canvas');
        resizedEdit.width = targetW;
        resizedEdit.height = targetH;
        const ctxEdit = resizedEdit.getContext('2d');
        ctxEdit.imageSmoothingEnabled = true;
        ctxEdit.drawImage(baseDrawCanvasEdit, 0, 0, targetW, targetH);
        baseDrawCanvasEdit = resizedEdit;
    }

    const dst = document.createElement('canvas');
    dst.width  = targetW;
    dst.height = targetH;
    dst.getContext('2d').drawImage(originalImage, 0, 0, targetW, targetH);

    const newImg = new Image();
    newImg.onload = () => {
        originalImage = newImg;
        uncroppedBaseImage = newImg;
        cropRectInBase = null;
        updateAfterTransform();
    };
    newImg.src = dst.toDataURL('image/png');
}

function updateAfterTransform() {
    fileSizeText.textContent = `${originalImage.naturalWidth} × ${originalImage.naturalHeight} px`;
    resizeWidth.value  = originalImage.naturalWidth;
    resizeHeight.value = originalImage.naturalHeight;
    pushHistory();

    let loadedCount = 0;
    const onTransformLoaded = () => {
        loadedCount++;
        if (loadedCount >= 2) {
            setTimeout(() => {
                resizeComparisonContainer();
                syncDrawCanvasSize();
                
                // Load persistent memory drawings onto screen canvases at correct layout scale
                loadDrawingsToScreen();
                
                processFilter();
            }, 50);
            imgOriginalSplit.onload = null;
            imgReferenceEdit.onload = null;
        }
    };

    imgOriginalSplit.onload = onTransformLoaded;
    imgReferenceEdit.onload = onTransformLoaded;

    imgOriginalSplit.src = originalImage.src;
    imgReferenceEdit.src = originalImage.src;
}



btnFlipH.addEventListener('click', () => flipImage(true));
btnFlipV.addEventListener('click', () => flipImage(false));

function updateViewerTransform() {
    const editWrapper = document.getElementById('image-edit-wrapper');
    const splitWrapper = document.getElementById('comparison-slider');
    
    // First update and clamp scrollbar bounds
    updateScrollbars();

    // Combine zoom translation, scale, and rotation preview
    const currentRotation = isCropping ? 0 : rotationPreview;
    const transformStr = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomScale}) rotate(${currentRotation}deg)`;
    
    if (editWrapper) {
        editWrapper.style.transform = transformStr;
        editWrapper.style.transition = 'none';
        editWrapper.style.transformOrigin = 'center center';
    }
    if (splitWrapper) {
        splitWrapper.style.transform = transformStr;
        splitWrapper.style.transition = 'none';
        splitWrapper.style.transformOrigin = 'center center';
    }

    if (isCropping) {
        updateCropSelectionDisplay();
    }

    refreshBrushPreview();
}

function resetRotationPreview() {
    rotationPreview = 0;
    if (sliderRotation) sliderRotation.value = 0;
    if (inputRotation) inputRotation.value = 0;
    updateViewerTransform();
}

function resetZoomAndPan() {
    zoomScale = 1.0;
    zoomPanX = 0;
    zoomPanY = 0;
    updateViewerTransform();
}

function updateScrollbars() {
    const activeView = viewSplit.classList.contains('hidden') ? viewEdit : viewSplit;
    const scrollH = activeView.querySelector('.custom-scrollbar-h');
    const scrollV = activeView.querySelector('.custom-scrollbar-v');
    
    // Hide scrollbars on the inactive view
    const inactiveView = viewSplit.classList.contains('hidden') ? viewSplit : viewEdit;
    const inactiveH = inactiveView.querySelector('.custom-scrollbar-h');
    const inactiveV = inactiveView.querySelector('.custom-scrollbar-v');
    if (inactiveH) inactiveH.classList.add('hidden');
    if (inactiveV) inactiveV.classList.add('hidden');

    if (!scrollH || !scrollV || !originalImage) {
        if (scrollH) scrollH.classList.add('hidden');
        if (scrollV) scrollV.classList.add('hidden');
        return;
    }

    const canvas = getActiveDrawCanvas();
    const viewerRect = imageViewer.getBoundingClientRect();

    // Viewport dimensions
    const Vw = viewerRect.width;
    const Vh = viewerRect.height;

    // Unscaled wrapper dimensions
    const W = canvas.clientWidth || canvas.width;
    const H = canvas.clientHeight || canvas.height;

    // Scaled dimensions
    const scaledW = W * zoomScale;
    const scaledH = H * zoomScale;

    // Horizontal scrollbar
    if (scaledW > Vw) {
        scrollH.classList.remove('hidden');
        const thumb = scrollH.querySelector('.custom-scrollbar-thumb');
        
        // Max translation offset to the left/right
        const maxPanX = (scaledW - Vw) / 2;
        const minPanX = -maxPanX;
        
        // Clamp current zoomPanX
        if (zoomPanX < minPanX) zoomPanX = minPanX;
        if (zoomPanX > maxPanX) zoomPanX = maxPanX;

        const trackWidth = scrollH.clientWidth;
        const thumbWidth = Math.max(20, Math.min(trackWidth, (Vw / scaledW) * trackWidth));
        thumb.style.width = thumbWidth + 'px';

        if (!isDraggingThumbH) {
            const range = maxPanX - minPanX;
            const fraction = range > 0 ? (maxPanX - zoomPanX) / range : 0;
            const maxLeft = trackWidth - thumbWidth;
            thumb.style.left = (fraction * maxLeft) + 'px';
        }
    } else {
        scrollH.classList.add('hidden');
        zoomPanX = 0;
    }

    // Vertical scrollbar
    if (scaledH > Vh) {
        scrollV.classList.remove('hidden');
        const thumb = scrollV.querySelector('.custom-scrollbar-thumb');

        // Max translation offset up/down
        const maxPanY = (scaledH - Vh) / 2;
        const minPanY = -maxPanY;

        // Clamp current zoomPanY
        if (zoomPanY < minPanY) zoomPanY = minPanY;
        if (zoomPanY > maxPanY) zoomPanY = maxPanY;

        const trackHeight = scrollV.clientHeight;
        const thumbHeight = Math.max(20, Math.min(trackHeight, (Vh / scaledH) * trackHeight));
        thumb.style.height = thumbHeight + 'px';

        if (!isDraggingThumbV) {
            const range = maxPanY - minPanY;
            const fraction = range > 0 ? (maxPanY - zoomPanY) / range : 0;
            const maxTop = trackHeight - thumbHeight;
            thumb.style.top = (fraction * maxTop) + 'px';
        }
    } else {
        scrollV.classList.add('hidden');
        zoomPanY = 0;
    }
}

function initScrollbarEvents() {
    ['view-edit', 'view-split'].forEach(viewId => {
        const view = document.getElementById(viewId);
        if (!view) return;
        const thumbH = view.querySelector('.custom-scrollbar-h .custom-scrollbar-thumb');
        const thumbV = view.querySelector('.custom-scrollbar-v .custom-scrollbar-thumb');
        const trackH = view.querySelector('.custom-scrollbar-h');
        const trackV = view.querySelector('.custom-scrollbar-v');

        if (thumbH && trackH) {
            thumbH.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only drag with left click
                isDraggingThumbH = true;
                startThumbMouseX = e.clientX;
                startThumbLeft = parseFloat(thumbH.style.left) || 0;
                e.preventDefault();
                e.stopPropagation();
            });

            trackH.addEventListener('mousedown', (e) => {
                if (e.target !== trackH) return;
                const clickX = e.offsetX;
                const trackWidth = trackH.clientWidth;
                const thumbWidth = thumbH.clientWidth;
                
                let newLeft = clickX - thumbWidth / 2;
                const maxLeft = trackWidth - thumbWidth;
                newLeft = Math.max(0, Math.min(maxLeft, newLeft));
                thumbH.style.left = newLeft + 'px';

                const fraction = maxLeft > 0 ? newLeft / maxLeft : 0;
                const canvas = getActiveDrawCanvas();
                const W = canvas.clientWidth || canvas.width;
                const scaledW = W * zoomScale;
                const viewerRect = imageViewer.getBoundingClientRect();
                const Vw = viewerRect.width;
                const maxPanX = (scaledW - Vw) / 2;
                const minPanX = -maxPanX;

                zoomPanX = maxPanX - fraction * (maxPanX - minPanX);
                updateViewerTransform();
            });
        }

        if (thumbV && trackV) {
            thumbV.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                isDraggingThumbV = true;
                startThumbMouseY = e.clientY;
                startThumbTop = parseFloat(thumbV.style.top) || 0;
                e.preventDefault();
                e.stopPropagation();
            });

            trackV.addEventListener('mousedown', (e) => {
                if (e.target !== trackV) return;
                const clickY = e.offsetY;
                const trackHeight = trackV.clientHeight;
                const thumbHeight = thumbV.clientHeight;

                let newTop = clickY - thumbHeight / 2;
                const maxTop = trackHeight - thumbHeight;
                newTop = Math.max(0, Math.min(maxTop, newTop));
                thumbV.style.top = newTop + 'px';

                const fraction = maxTop > 0 ? newTop / maxTop : 0;
                const canvas = getActiveDrawCanvas();
                const H = canvas.clientHeight || canvas.height;
                const scaledH = H * zoomScale;
                const viewerRect = imageViewer.getBoundingClientRect();
                const Vh = viewerRect.height;
                const maxPanY = (scaledH - Vh) / 2;
                const minPanY = -maxPanY;

                zoomPanY = maxPanY - fraction * (maxPanY - minPanY);
                updateViewerTransform();
            });
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingThumbH) {
            const activeView = viewSplit.classList.contains('hidden') ? viewEdit : viewSplit;
            const scrollH = activeView.querySelector('.custom-scrollbar-h');
            const thumb = scrollH.querySelector('.custom-scrollbar-thumb');
            const trackWidth = scrollH.clientWidth;
            const thumbWidth = thumb.clientWidth;
            const maxLeft = trackWidth - thumbWidth;

            let deltaX = e.clientX - startThumbMouseX;
            let newLeft = Math.max(0, Math.min(maxLeft, startThumbLeft + deltaX));
            thumb.style.left = newLeft + 'px';

            const fraction = maxLeft > 0 ? newLeft / maxLeft : 0;
            const canvas = getActiveDrawCanvas();
            const W = canvas.clientWidth || canvas.width;
            const scaledW = W * zoomScale;
            const viewerRect = imageViewer.getBoundingClientRect();
            const Vw = viewerRect.width;
            const maxPanX = (scaledW - Vw) / 2;
            const minPanX = -maxPanX;

            zoomPanX = maxPanX - fraction * (maxPanX - minPanX);
            updateViewerTransform();
        }

        if (isDraggingThumbV) {
            const activeView = viewSplit.classList.contains('hidden') ? viewEdit : viewSplit;
            const scrollV = activeView.querySelector('.custom-scrollbar-v');
            const thumb = scrollV.querySelector('.custom-scrollbar-thumb');
            const trackHeight = scrollV.clientHeight;
            const thumbHeight = thumb.clientHeight;
            const maxTop = trackHeight - thumbHeight;

            let deltaY = e.clientY - startThumbMouseY;
            let newTop = Math.max(0, Math.min(maxTop, startThumbTop + deltaY));
            thumb.style.top = newTop + 'px';

            const fraction = maxTop > 0 ? newTop / maxTop : 0;
            const canvas = getActiveDrawCanvas();
            const H = canvas.clientHeight || canvas.height;
            const scaledH = H * zoomScale;
            const viewerRect = imageViewer.getBoundingClientRect();
            const Vh = viewerRect.height;
            const maxPanY = (scaledH - Vh) / 2;
            const minPanY = -maxPanY;

            zoomPanY = maxPanY - fraction * (maxPanY - minPanY);
            updateViewerTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        isDraggingThumbH = false;
        isDraggingThumbV = false;
    });
}

bindSliderAndInput(sliderRotation, inputRotation, (val) => {
    rotationPreview = val;
    updateViewerTransform();
});

// Resize
let resizeRatio = 1;

resizeWidth.addEventListener('focus',  () => { resizeWidth.select(); });
resizeHeight.addEventListener('focus', () => { resizeHeight.select(); });

resizeWidth.addEventListener('input', () => {
    if (resizeKeepRatio.checked && originalImage) {
        const w = parseInt(resizeWidth.value) || 1;
        const ratio = originalImage.naturalHeight / originalImage.naturalWidth;
        resizeHeight.value = Math.round(w * ratio);
    }
});

resizeHeight.addEventListener('input', () => {
    if (resizeKeepRatio.checked && originalImage) {
        const h = parseInt(resizeHeight.value) || 1;
        const ratio = originalImage.naturalWidth / originalImage.naturalHeight;
        resizeWidth.value = Math.round(h * ratio);
    }
});

btnResizeApply.addEventListener('click', async () => {
    const w = parseInt(resizeWidth.value);
    const h = parseInt(resizeHeight.value);
    if (!w || !h || w < 1 || h < 1) {
        await showAlert("Dimensions invalides", "Veuillez entrer une largeur et une hauteur valides (> 0).");
        return;
    }
    resizeImageTo(w, h);
});


// ---------------------------------------------------------------------------
// 13. CROP MODULE
// ---------------------------------------------------------------------------

btnCropStart.addEventListener('click', () => {
    if (!originalImage) return;
    startCrop();
});

btnCropCancel.addEventListener('click', cancelCrop);
btnCropApply.addEventListener('click',  applyCrop);

function startCrop() {
    if (!originalImage || !uncroppedBaseImage) return;

    isCropping = true;
    cropOverlay.classList.remove('hidden');
    document.body.classList.remove('draw-mode');
    document.body.classList.remove('eraser-mode');

    // Force rotation preview to 0 during crop for correct UI coordinates mapping
    updateViewerTransform();

    // Wait for the reference image to load the new src before resizing containers!
    let loadedCount = 0;
    const onRefImageLoaded = () => {
        loadedCount++;
        if (loadedCount >= 2) {
            setTimeout(() => {
                resizeComparisonContainer();
                syncDrawCanvasSize();

                // Draw the full persistent memory drawings onto the screen canvases
                const wSplit = drawCanvasSplit.width;
                const hSplit = drawCanvasSplit.height;
                clearDrawCanvas(drawCanvasSplit);
                if (wSplit > 0 && hSplit > 0 && baseDrawCanvasSplit.width > 0 && baseDrawCanvasSplit.height > 0) {
                    const ctxSplit = drawCanvasSplit.getContext('2d');
                    ctxSplit.imageSmoothingEnabled = true;
                    ctxSplit.drawImage(baseDrawCanvasSplit, 0, 0, wSplit, hSplit);
                }

                const wEdit = drawCanvasEdit.width;
                const hEdit = drawCanvasEdit.height;
                clearDrawCanvas(drawCanvasEdit);
                if (wEdit > 0 && hEdit > 0 && baseDrawCanvasEdit.width > 0 && baseDrawCanvasEdit.height > 0) {
                    const ctxEdit = drawCanvasEdit.getContext('2d');
                    ctxEdit.imageSmoothingEnabled = true;
                    ctxEdit.drawImage(baseDrawCanvasEdit, 0, 0, wEdit, hEdit);
                }

                // Redraw the canvas with the uncropped base image
                processFilter();

                if (cropRectInBase) {
                    cropRect = { ...cropRectInBase };
                } else {
                    // Default selection: full uncropped base image size
                    cropRect = {
                        x: 0,
                        y: 0,
                        w: uncroppedBaseImage.naturalWidth,
                        h: uncroppedBaseImage.naturalHeight
                    };
                }
                updateCropSelectionDisplay();
            }, 50);

            imgOriginalSplit.onload = null;
            imgReferenceEdit.onload = null;
        }
    };

    imgOriginalSplit.onload = onRefImageLoaded;
    imgReferenceEdit.onload = onRefImageLoaded;

    // Temporarily show uncroppedBaseImage in the viewer to allow zooming out
    imgOriginalSplit.src = uncroppedBaseImage.src;
    imgReferenceEdit.src = uncroppedBaseImage.src;
}

function cancelCrop() {
    isCropping = false;
    cropOverlay.classList.add('hidden');

    // Restore rotation preview
    updateViewerTransform();

    let loadedCount = 0;
    const onRestoreLoaded = () => {
        loadedCount++;
        if (loadedCount >= 2) {
            setTimeout(() => {
                resizeComparisonContainer();
                syncDrawCanvasSize();

                // Restore drawings from persistent memory canvases at screen scale
                loadDrawingsToScreen();

                processFilter();
            }, 50);
            
            imgOriginalSplit.onload = null;
            imgReferenceEdit.onload = null;
        }
    };

    imgOriginalSplit.onload = onRestoreLoaded;
    imgReferenceEdit.onload = onRestoreLoaded;

    // Restore originalImage (cropped version) in the viewer
    imgOriginalSplit.src = originalImage.src;
    imgReferenceEdit.src = originalImage.src;
}

function applyCrop() {
    if (!uncroppedBaseImage) return;
    
    // Clamp selection on apply just in case
    clampCropSelection(false);

    const x = Math.round(Math.max(0, cropRect.x));
    const y = Math.round(Math.max(0, cropRect.y));
    const w = Math.round(Math.min(uncroppedBaseImage.naturalWidth  - x, cropRect.w));
    const h = Math.round(Math.min(uncroppedBaseImage.naturalHeight - y, cropRect.h));

    if (w < 1 || h < 1) return;

    cropRectInBase = { x, y, w, h };

    const src = bakeImageToCanvas(uncroppedBaseImage);
    const dst = document.createElement('canvas');
    dst.width  = w;
    dst.height = h;
    dst.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);

    const newImg = new Image();
    newImg.onload = () => {
        originalImage = newImg;
        isCropping = false;
        cropOverlay.classList.add('hidden');
        updateViewerTransform(); // Restore rotation preview
        updateAfterTransform();
    };
    newImg.src = dst.toDataURL('image/png');
}

function updateCropSelectionDisplay() {
    const canvas = getActiveDrawCanvas();
    if (!canvas || !uncroppedBaseImage) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / uncroppedBaseImage.naturalWidth;
    const scaleY = canvas.height / uncroppedBaseImage.naturalHeight;
    const dispW  = rect.width  / canvas.width;
    const dispH  = rect.height / canvas.height;

    // Correct alignment offset relative to image-viewer container
    const viewerRect = imageViewer.getBoundingClientRect();
    const leftOffset = rect.left - viewerRect.left;
    const topOffset  = rect.top - viewerRect.top;

    // Map crop rect from image coords to overlay coords with offset correction
    const ox = (cropRect.x * scaleX * dispW) + leftOffset;
    const oy = (cropRect.y * scaleY * dispH) + topOffset;
    const ow = cropRect.w * scaleX * dispW;
    const oh = cropRect.h * scaleY * dispH;

    cropSelection.style.left   = ox + 'px';
    cropSelection.style.top    = oy + 'px';
    cropSelection.style.width  = ow + 'px';
    cropSelection.style.height = oh + 'px';
}

function clampCropSelection(wasMoving) {
    if (!uncroppedBaseImage) return;

    const imgW = uncroppedBaseImage.naturalWidth;
    const imgH = uncroppedBaseImage.naturalHeight;

    if (wasMoving) {
        // Enforce same size, shift position to fit
        if (cropRect.w > imgW) cropRect.w = imgW;
        if (cropRect.h > imgH) cropRect.h = imgH;

        if (cropRect.x < 0) cropRect.x = 0;
        if (cropRect.x + cropRect.w > imgW) cropRect.x = imgW - cropRect.w;

        if (cropRect.y < 0) cropRect.y = 0;
        if (cropRect.y + cropRect.h > imgH) cropRect.y = imgH - cropRect.h;
    } else {
        // Resizing: clamp edges
        let left = cropRect.x;
        let right = cropRect.x + cropRect.w;
        let top = cropRect.y;
        let bottom = cropRect.y + cropRect.h;

        if (left < 0) left = 0;
        if (right > imgW) right = imgW;
        if (top < 0) top = 0;
        if (bottom > imgH) bottom = imgH;

        // Ensure minimum size
        const minSize = 20;
        if (right - left < minSize) {
            if (left === 0) right = minSize;
            else left = right - minSize;
        }
        if (bottom - top < minSize) {
            if (top === 0) bottom = minSize;
            else top = bottom - minSize;
        }

        cropRect.x = left;
        cropRect.y = top;
        cropRect.w = right - left;
        cropRect.h = bottom - top;
    }

    updateCropSelectionDisplay();
}

// Drag crop selection
cropSelection.addEventListener('mousedown', (e) => {
    const pos = e.target.dataset.pos;
    cropDragging = pos || 'move';
    cropStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    e.stopPropagation();
});

window.addEventListener('mousemove', (e) => {
    if (!isCropping || !cropDragging || !uncroppedBaseImage) return;
    const canvas = getActiveDrawCanvas();
    const rect   = canvas.getBoundingClientRect();
    const scaleX = uncroppedBaseImage.naturalWidth  / rect.width;
    const scaleY = uncroppedBaseImage.naturalHeight / rect.height;
    const dx = (e.clientX - cropStart.x) * scaleX;
    const dy = (e.clientY - cropStart.y) * scaleY;
    cropStart = { x: e.clientX, y: e.clientY };

    if (cropDragging === 'move') {
        cropRect.x += dx;
        cropRect.y += dy;
    } else {
        if (cropDragging.includes('e')) cropRect.w = Math.max(20*scaleX, cropRect.w + dx);
        if (cropDragging.includes('s')) cropRect.h = Math.max(20*scaleY, cropRect.h + dy);
        if (cropDragging.includes('w')) { cropRect.x += dx; cropRect.w = Math.max(20*scaleX, cropRect.w - dx); }
        if (cropDragging.includes('n')) { cropRect.y += dy; cropRect.h = Math.max(20*scaleY, cropRect.h - dy); }
    }

    updateCropSelectionDisplay();
});

window.addEventListener('mouseup', () => {
    if (isCropping && cropDragging && uncroppedBaseImage) {
        const wasMoving = cropDragging === 'move';
        cropDragging = null;
        clampCropSelection(wasMoving);
    } else {
        cropDragging = null;
    }
});


// ---------------------------------------------------------------------------
// 14. UNDO / REDO
// ---------------------------------------------------------------------------

function pushHistory() {
    if (!originalImage) return;

    // Encode current state with high-definition drawings directly from baseDrawCanvas
    const state = {
        src:       originalImage.src,
        drawSplit: baseDrawCanvasSplit.toDataURL(),
        drawSide:  baseDrawCanvasEdit.toDataURL(),
        cropRectInBase: cropRectInBase ? { ...cropRectInBase } : null
    };

    // Truncate future if we branched
    history = history.slice(0, historyIdx + 1);
    history.push(state);
    if (history.length > MAX_HISTORY) history.shift();
    historyIdx = history.length - 1;
    updateHistoryButtons();
}

function restoreHistory(state) {
    const img = new Image();
    img.onload = () => {
        originalImage = img;
        cropRectInBase = state.cropRectInBase ? { ...state.cropRectInBase } : null;
        imgOriginalSplit.src = img.src;
        imgReferenceEdit.src = img.src;
        fileSizeText.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
        resizeWidth.value  = img.naturalWidth;
        resizeHeight.value = img.naturalHeight;

        let loadedCount = 0;
        function checkAllLoaded() {
            loadedCount++;
            if (loadedCount >= 2) {
                setTimeout(() => {
                    resizeComparisonContainer();
                    syncDrawCanvasSize();
                    processFilter();
                }, 80);
            }
        }

        const rSplit = new Image();
        rSplit.onload = () => {
            baseDrawCanvasSplit.width = rSplit.width;
            baseDrawCanvasSplit.height = rSplit.height;
            const ctx = baseDrawCanvasSplit.getContext('2d');
            ctx.clearRect(0, 0, baseDrawCanvasSplit.width, baseDrawCanvasSplit.height);
            ctx.drawImage(rSplit, 0, 0);
            checkAllLoaded();
        };
        rSplit.src = state.drawSplit;

        const rSide = new Image();
        rSide.onload = () => {
            baseDrawCanvasEdit.width = rSide.width;
            baseDrawCanvasEdit.height = rSide.height;
            const ctx = baseDrawCanvasEdit.getContext('2d');
            ctx.clearRect(0, 0, baseDrawCanvasEdit.width, baseDrawCanvasEdit.height);
            ctx.drawImage(rSide, 0, 0);
            checkAllLoaded();
        };
        rSide.src = state.drawSide;
    };
    img.src = state.src;
}

function updateHistoryButtons() {
    btnUndo.disabled = historyIdx <= 0;
    btnRedo.disabled = historyIdx >= history.length - 1;
}

btnUndo.addEventListener('click', () => {
    if (historyIdx > 0) { historyIdx--; restoreHistory(history[historyIdx]); updateHistoryButtons(); }
});
btnRedo.addEventListener('click', () => {
    if (historyIdx < history.length - 1) { historyIdx++; restoreHistory(history[historyIdx]); updateHistoryButtons(); }
});

document.addEventListener('keydown', (e) => {
    // Ignore global undo/redo keys if user is typing inside an input or textarea
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); btnUndo.click(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); btnRedo.click(); }
});


// ---------------------------------------------------------------------------
// 15. EXPORT / DOWNLOAD
// ---------------------------------------------------------------------------

formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        formatBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportFormat = btn.dataset.fmt;

        if (exportFormat === 'png') {
            qualitySliderContainer.classList.add('hidden');
        } else {
            qualitySliderContainer.classList.remove('hidden');
        }
    });
});

bindSliderAndInput(exportQualitySlider, inputExportQuality, (val) => {
    exportQuality = val / 100;
});

btnSave.addEventListener('click', () => {
    if (!originalImage) return;

    const w = originalImage.naturalWidth  || originalImage.width;
    const h = originalImage.naturalHeight || originalImage.height;

    // 1. Create a temporary canvas at original image size to apply filters and drawings
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');

    let scaledBlur = parseFloat(sliderBlur.value);
    if (activeFilters.includes("Flou")) {
        const displayW = imgOriginalSplit.clientWidth || w;
        scaledBlur     = scaledBlur * (w / displayW);
    }

    applyFiltersToContext(tempCtx, originalImage, w, h,
        activeFilters, scaledBlur, parseInt(sliderOpacity.value));

    // Composite draw layer on top
    const drawExport = getDrawCanvasForExport();
    tempCtx.drawImage(drawExport, 0, 0, w, h);

    // 2. Render to final export canvas with rotation if necessary
    const exportCanvas = document.createElement('canvas');
    if (rotationPreview !== 0) {
        const rad = (rotationPreview * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const nw = Math.round(w * cos + h * sin);
        const nh = Math.round(w * sin + h * cos);
        exportCanvas.width = nw;
        exportCanvas.height = nh;
        const ctx = exportCanvas.getContext('2d');
        ctx.save();
        ctx.translate(nw / 2, nh / 2);
        ctx.rotate(rad);
        ctx.drawImage(tempCanvas, -w / 2, -h / 2);
        ctx.restore();
    } else {
        exportCanvas.width = w;
        exportCanvas.height = h;
        const ctx = exportCanvas.getContext('2d');
        ctx.drawImage(tempCanvas, 0, 0);
    }

    // 3. Build filename
    const activeFiltersList = Array.from(activeFilters).filter(f => f !== 'Aucun');
    const formatSuffix = activeFiltersList.length > 0 
        ? activeFiltersList.join('_').toLowerCase().replace(/\s/g, '_')
        : 'aucun';
    const suffix       = formatSuffix !== 'aucun' ? `-${formatSuffix}` : '';
    const extMap       = { png: 'png', jpeg: 'jpg', webp: 'webp' };
    const ext          = extMap[exportFormat] || 'png';
    const mimeType     = `image/${exportFormat}`;

    const filename = `${originalFileName}${suffix}.${ext}`;
    const dataUrl = exportCanvas.toDataURL(mimeType, exportFormat === 'png' ? 1.0 : exportQuality);

    // Try native pywebview file dialog first, fallback to browser link download
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_file) {
        window.pywebview.api.save_file(dataUrl, filename)
                        .catch(err => {
                console.error("Native save failed, falling back to link download:", err);
                fallbackDownload(dataUrl, filename);
            });
    } else {
        fallbackDownload(dataUrl, filename);
    }
});

function fallbackDownload(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
}


// ---------------------------------------------------------------------------
// 16. RESET
// ---------------------------------------------------------------------------

btnReset.addEventListener('click', async () => {
    const ok = await showConfirm("Réinitialiser l'éditeur", "Voulez-vous réinitialiser l'image et l'éditeur ? Cette action est irréversible.");
    if (ok) {
        originalImage      = null;
        uncroppedBaseImage = null;
        cropRectInBase     = null;
        originalFileName   = "image";
        history            = [];
        historyIdx         = -1;

        fileInput.value   = "";
        imgOriginalSplit.src = "";
        imgReferenceEdit.src = "";
        fileNameText.textContent = "-";
        fileSizeText.textContent = "-";
        btnChangeImage.style.display = 'none';

        emptyState.classList.remove('hidden');
        imageViewer.classList.add('hidden');
        controlsSection.classList.add('disabled');
        drawControls.classList.add('disabled');
        transformControls.classList.add('disabled');
        historyToolbar.classList.add('hidden');
        btnSave.disabled  = true;
        btnReset.disabled = true;

        baseDrawCanvasSplit.width = 1;
        baseDrawCanvasSplit.height = 1;
        baseDrawCanvasSplit.getContext('2d').clearRect(0, 0, 1, 1);

        baseDrawCanvasEdit.width = 1;
        baseDrawCanvasEdit.height = 1;
        baseDrawCanvasEdit.getContext('2d').clearRect(0, 0, 1, 1);

        clearDrawCanvas(drawCanvasSplit);
        clearDrawCanvas(drawCanvasEdit);
        resetFilterSelection();
        resetAdjustments();
        updateHistoryButtons();

        document.body.classList.remove('draw-mode', 'eraser-mode');

        resetRotationPreview();
        resetZoomAndPan();
    }
});


// ---------------------------------------------------------------------------
// 17. INITIALIZATION
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mise à jour automatique
// ---------------------------------------------------------------------------

// L'API pywebview n'est utilisable qu'une fois ses méthodes exposées (sous Windows, WebView2
// peut présenter « window.pywebview.api » avant elles).
function updaterApi() {
    const api = window.pywebview && window.pywebview.api;
    return api && typeof api.check_update === 'function' ? api : null;
}

async function initUpdater() {
    const button = document.getElementById('update-status');
    const label = button && button.querySelector('.update-label');
    const api = updaterApi();
    if (!button || !label || !api) return;

    const setState = (state, text, title) => {
        button.className = `update-status is-${state}`;
        button.disabled = state === 'ok' || state === 'busy';
        label.textContent = text;
        button.title = title;
        button.hidden = false;
    };

    let info = null;
    for (let attempt = 1; attempt <= 3 && !info; attempt++) {
        try {
            info = await api.check_update();
        } catch (e) {
            info = null;
            await new Promise((resolve) => setTimeout(resolve, 1500)); // nouvel essai
        }
    }
    if (!info) return; // hors ligne ou erreur persistante : rien à afficher
    if (info && info.available) {
        setState('available', 'Mettre à jour', `Version ${info.version} disponible : cliquer pour mettre à jour`);
    } else if (info && info.up_to_date) {
        setState('ok', 'À jour', `PicTone ${info.version} est à jour`);
    } else {
        return; // pas de mise à jour applicable (mode développement)
    }

    button.addEventListener('click', async () => {
        if (!button.classList.contains('is-available')) return;
        setState('busy', 'Téléchargement…', 'Téléchargement de la mise à jour');
        try {
            const result = await api.install_update();
            if (!result.ok) throw new Error(result.error);
            if (result.manual) {
                setState('available', 'Mettre à jour', 'Téléchargement ouvert dans le navigateur');
                return;
            }
            setState('busy', 'Redémarrage…', 'PicTone va redémarrer');
        } catch (e) {
            setState('available', 'Réessayer', `Échec : ${e.message}`);
        }
    });
}

// L'événement « pywebviewready » peut être émis avant le chargement de ce script (defer) :
// on lance donc le contrôle dès que l'API est disponible, par l'événement ou par une vérification répétée.
let updaterStarted = false;
function startUpdaterOnce() {
    if (updaterStarted || !updaterApi()) return;
    updaterStarted = true;
    initUpdater();
}
window.addEventListener('pywebviewready', startUpdaterOnce);
let updaterAttempts = 0;
const updaterTimer = setInterval(() => {
    startUpdaterOnce();
    updaterAttempts += 1;
    if (updaterStarted || updaterAttempts > 150) clearInterval(updaterTimer); // 30 s maximum
}, 200);

document.addEventListener('DOMContentLoaded', () => {
    updateHistoryButtons();

    // Set initial draw mode cursor off
    document.body.classList.remove('draw-mode', 'eraser-mode');

    // Toggle layers panel collapse
    if (btnToggleLayers) {
        btnToggleLayers.addEventListener('click', () => {
            filterLayersPanel.classList.toggle('collapsed');
        });
    }

    // Zoom and Panning Event Listeners
    const viewerContainer = document.getElementById('image-viewer');
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    // Track Spacebar key down/up (ignoring when user is typing in inputs)
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement && 
            document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
            spacePressed = true;
            e.preventDefault(); // Prevents default space scrolling
            if (viewerContainer) viewerContainer.style.cursor = 'grab';
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            spacePressed = false;
            if (viewerContainer) viewerContainer.style.cursor = 'default';
        }
    });

    // Zoom/Scroll via Mouse Wheel (register on document to force preventDefault on native webview zoom)
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.shiftKey || e.altKey) {
            // Unfocus active inputs/textareas to release focus lock and let zoom/scroll work immediately
            if (document.activeElement && 
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                document.activeElement.blur();
            }
        }

        if (e.ctrlKey) {
            e.preventDefault();
            if (!originalImage) return;
            const oldScale = zoomScale;
            const zoomStep = 0.1;
            if (e.deltaY < 0) {
                zoomScale = Math.min(5.0, zoomScale + zoomStep);
            } else {
                zoomScale = Math.max(0.5, zoomScale - zoomStep);
            }
            updateViewerTransform();
        } else if (e.shiftKey) {
            // Shift + Wheel = scroll vertically
            if (!originalImage) return;
            const canvas = getActiveDrawCanvas();
            const H = canvas.clientHeight || canvas.height;
            const scaledH = H * zoomScale;
            const viewerRect = imageViewer.getBoundingClientRect();
            if (scaledH > viewerRect.height) {
                e.preventDefault();
                zoomPanY -= e.deltaY * 0.8;
                updateViewerTransform();
            }
        } else if (e.altKey) {
            // Alt + Wheel = scroll horizontally
            if (!originalImage) return;
            const canvas = getActiveDrawCanvas();
            const W = canvas.clientWidth || canvas.width;
            const scaledW = W * zoomScale;
            const viewerRect = imageViewer.getBoundingClientRect();
            if (scaledW > viewerRect.width) {
                e.preventDefault();
                zoomPanX -= e.deltaY * 0.8;
                updateViewerTransform();
            }
        }
    }, { passive: false });

    // Block native Ctrl + key shortcuts for zoom (Plus, Minus, Equal, Zero)
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
            e.preventDefault();
        }
    });

    // Pan via Middle Click (button 1), Right Click (button 2), or Spacebar + Left Click (button 0)
    if (viewerContainer) {
        viewerContainer.addEventListener('mousedown', (e) => {
            const isMiddleClick = e.button === 1;
            const isRightClick = e.button === 2;
            const isSpacePan = spacePressed && e.button === 0;

            const isDrawingMode = document.body.classList.contains('draw-mode') || document.body.classList.contains('eraser-mode');
            const allowRightClickPan = isRightClick && !isDrawingMode;

            if (isMiddleClick || allowRightClickPan || isSpacePan) {
                isPanning = true;
                panStartX = e.clientX - zoomPanX;
                panStartY = e.clientY - zoomPanY;
                viewerContainer.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
            }
        });

        viewerContainer.addEventListener('contextmenu', (e) => {
            // Prevent context menu during drawing or during panning with right-click
            const isDrawingMode = document.body.classList.contains('draw-mode') || document.body.classList.contains('eraser-mode');
            if (isDrawingMode || zoomScale > 1.01 || zoomPanX !== 0 || zoomPanY !== 0) {
                e.preventDefault();
            }
        });

        viewerContainer.addEventListener('dblclick', () => {
            // Double click to reset zoom & pan
            resetZoomAndPan();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            zoomPanX = e.clientX - panStartX;
            zoomPanY = e.clientY - panStartY;
            updateViewerTransform();
            e.preventDefault();
            e.stopPropagation();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            if (viewerContainer) {
                viewerContainer.style.cursor = spacePressed ? 'grab' : 'default';
            }
        }
    });

    // Initialize custom scrollbar drag and track-click events
    initScrollbarEvents();
});
