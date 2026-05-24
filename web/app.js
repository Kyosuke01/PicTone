// Global state
let currentVersion = "1.0.0";
let originalImage = null;
let originalFileName = "image";
let activeFilter = "Aucun";

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controlsSection = document.getElementById('controls-section');
const emptyState = document.getElementById('empty-state');
const imageViewer = document.getElementById('image-viewer');
const btnSave = document.getElementById('btn-save');
const btnReset = document.getElementById('btn-reset');
const btnChangeImage = document.getElementById('btn-change-image');
const currentVersionText = document.getElementById('current-version-text');

// File Info DOM Elements
const fileNameText = document.getElementById('file-name-text');
const fileSizeText = document.getElementById('file-size-text');

// Viewer Mode tabs
const tabSplit = document.getElementById('tab-split');
const tabSide = document.getElementById('tab-side');
const viewSplit = document.getElementById('view-split');
const viewSide = document.getElementById('view-side');

// Image layers
const imgOriginalSplit = document.getElementById('img-original-split');
const canvasFilteredSplit = document.getElementById('canvas-filtered-split');
const imgOriginalSide = document.getElementById('img-original-side');
const canvasFilteredSide = document.getElementById('canvas-filtered-side');

// Comparison Slider elements
const comparisonSlider = document.getElementById('comparison-slider');
const filteredWrapper = document.getElementById('filtered-wrapper');
const sliderHandle = document.getElementById('slider-handle');

// Sliders and values
const sliderBlurContainer = document.getElementById('slider-blur-container');
const sliderBlur = document.getElementById('slider-blur');
const blurVal = document.getElementById('blur-val');

const sliderOpacityContainer = document.getElementById('slider-opacity-container');
const sliderOpacity = document.getElementById('slider-opacity');
const opacityVal = document.getElementById('opacity-val');

// Filter items (updated selector from .filter-card to .filter-item)
const filterCards = document.querySelectorAll('.filter-item');

// Update banner elements
const updateBanner = document.getElementById('update-banner');
const latestVersionText = document.getElementById('latest-version-text');
const updateLink = document.getElementById('update-link');
const closeUpdateBanner = document.getElementById('close-update-banner');

// Modal DOM Elements
const appModal = document.getElementById('app-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalClose = document.getElementById('modal-close');
const modalBtnCancel = document.getElementById('modal-btn-cancel');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');

let modalResolver = null;

function showAlert(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalBtnCancel.style.display = 'none';
        modalBtnConfirm.textContent = 'OK';
        
        appModal.classList.remove('hidden');
        
        modalResolver = (result) => {
            appModal.classList.add('hidden');
            resolve(result);
        };
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
        
        modalResolver = (result) => {
            appModal.classList.add('hidden');
            resolve(result);
        };
    });
}

// Bind modal closing events
modalClose.addEventListener('click', () => {
    if (modalResolver) modalResolver(false);
});
modalBtnCancel.addEventListener('click', () => {
    if (modalResolver) modalResolver(false);
});
modalBtnConfirm.addEventListener('click', () => {
    if (modalResolver) modalResolver(true);
});
appModal.addEventListener('click', (e) => {
    if (e.target === appModal) {
        if (modalResolver) modalResolver(false);
    }
});

/* ----------------------------------------------------
   2. VERSION & UPDATES CHECK
   ---------------------------------------------------- */
async function checkUpdates() {
    try {
        const verResponse = await fetch('/api/version');
        const verData = await verResponse.json();
        currentVersion = verData.version;
        currentVersionText.textContent = currentVersion;
    } catch (e) {
        console.error("Impossible de récupérer la version locale :", e);
    }

    try {
        const githubUrl = "https://raw.githubusercontent.com/Kyosuke01/PicTone/main/version.txt";
        const response = await fetch(githubUrl);
        if (!response.ok) return;
        const latestVer = (await response.text()).trim();

        if (latestVer && latestVer !== currentVersion) {
            latestVersionText.textContent = latestVer;
            updateLink.href = "https://github.com/Kyosuke01/PicTone/releases/latest";
            updateBanner.classList.remove('hidden');
        }
    } catch (e) {
        console.log("Erreur lors de la vérification de mise à jour :", e);
    }
}

closeUpdateBanner.addEventListener('click', () => {
    updateBanner.classList.add('hidden');
});

/* ----------------------------------------------------
   3. DRAG & DROP & LOADING IMAGE
   ---------------------------------------------------- */
// Drag events on the drop zone
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    }, false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Also support dropping files directly onto the workspace when an image is already loaded
const appWorkspace = document.getElementById('app-workspace');
['dragenter', 'dragover'].forEach(eventName => {
    appWorkspace.addEventListener(eventName, (e) => {
        e.preventDefault();
    }, false);
});
appWorkspace.addEventListener('drop', (e) => {
    e.preventDefault();
    if (originalImage && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Click on the Change Image button
btnChangeImage.addEventListener('click', () => {
    fileInput.click();
});

// Copy-Paste support
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
        await showAlert("Format non supporté", "Veuillez sélectionner un fichier image valide (PNG, JPEG, BMP).");
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
            
            // Set file metadata in sidebar
            fileNameText.textContent = displayName;
            fileSizeText.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            btnChangeImage.style.display = 'block';

            // Set image sources
            imgOriginalSplit.src = event.target.result;
            imgOriginalSide.src = event.target.result;

            // Enable layout
            emptyState.classList.add('hidden');
            imageViewer.classList.remove('hidden');
            controlsSection.classList.remove('disabled');
            btnSave.disabled = false;
            btnReset.disabled = false;

            // Reset filter selection to "Aucun"
            resetFilterSelection();
            
            // Recalculate size and apply filter
            setTimeout(() => {
                resizeComparisonContainer();
                processFilter();
            }, 100);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function resetFilterSelection() {
    activeFilter = "Aucun";
    filterCards.forEach(card => {
        card.classList.remove('active');
        if (card.dataset.filter === "Aucun") {
            card.classList.add('active');
        }
    });
    sliderBlurContainer.classList.add('hidden');
    sliderOpacityContainer.classList.add('hidden');
}

/* ----------------------------------------------------
   4. IMAGE VIEWER MECHANICS (SLIDER & TABS)
   ---------------------------------------------------- */
// Tab toggling
tabSplit.addEventListener('click', () => {
    tabSplit.classList.add('active');
    tabSide.classList.remove('active');
    viewSplit.classList.remove('hidden');
    viewSide.classList.add('hidden');
    resizeComparisonContainer();
});

tabSide.addEventListener('click', () => {
    tabSide.classList.add('active');
    tabSplit.classList.remove('active');
    viewSide.classList.remove('hidden');
    viewSplit.classList.add('hidden');
    processFilter();
});

// Resize handler
window.addEventListener('resize', () => {
    if (originalImage) {
        resizeComparisonContainer();
    }
});

function resizeComparisonContainer() {
    if (!originalImage || viewSplit.classList.contains('hidden')) return;

    const w = imgOriginalSplit.clientWidth;
    const h = imgOriginalSplit.clientHeight;

    if (w > 0 && h > 0) {
        comparisonSlider.style.width = w + 'px';
        comparisonSlider.style.height = h + 'px';
        
        // Sync filter canvas visual size to container
        canvasFilteredSplit.style.width = w + 'px';
        canvasFilteredSplit.style.height = h + 'px';
        
        // Reset slider position in center
        updateSliderPosition(50);
        
        // Render filter
        processFilter();
    }
}

// Slider drag events
let isDragging = false;

function startDrag(e) {
    isDragging = true;
    e.preventDefault();
}

function stopDrag() {
    isDragging = false;
}

function drag(e) {
    if (!isDragging) return;

    const rect = comparisonSlider.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let offsetX = clientX - rect.left;

    offsetX = Math.max(0, Math.min(offsetX, rect.width));
    const percent = (offsetX / rect.width) * 100;

    updateSliderPosition(percent);
}

function updateSliderPosition(percent) {
    filteredWrapper.style.width = percent + '%';
    sliderHandle.style.left = percent + '%';
}

sliderHandle.addEventListener('mousedown', startDrag);
window.addEventListener('mouseup', stopDrag);
window.addEventListener('mousemove', drag);

sliderHandle.addEventListener('touchstart', startDrag, { passive: true });
window.addEventListener('touchend', stopDrag);
window.addEventListener('touchmove', drag, { passive: true });

/* ----------------------------------------------------
   5. FILTER PROCESSING & CANVAS ENGINE
   ---------------------------------------------------- */
// Filter buttons click
filterCards.forEach(card => {
    card.addEventListener('click', () => {
        filterCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        activeFilter = card.dataset.filter;
        
        // Hide/Show sliders based on selection
        sliderBlurContainer.classList.add('hidden');
        sliderOpacityContainer.classList.add('hidden');

        if (activeFilter === "Flou") {
            sliderBlurContainer.classList.remove('hidden');
        } else if (activeFilter === "Opacité") {
            sliderOpacityContainer.classList.remove('hidden');
        }

        processFilter();
    });
});

// Slider inputs change
sliderBlur.addEventListener('input', (e) => {
    blurVal.textContent = e.target.value + " px";
    processFilter();
});

sliderOpacity.addEventListener('input', (e) => {
    const percent = Math.round((e.target.value / 255) * 100);
    opacityVal.textContent = percent + "%";
    processFilter();
});

function processFilter() {
    if (!originalImage) return;

    const isSplit = !viewSplit.classList.contains('hidden');
    const targetCanvas = isSplit ? canvasFilteredSplit : canvasFilteredSide;
    const refImage = isSplit ? imgOriginalSplit : imgOriginalSide;

    const w = refImage.clientWidth || originalImage.width;
    const h = refImage.clientHeight || originalImage.height;

    targetCanvas.width = w;
    targetCanvas.height = h;

    const ctx = targetCanvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Render filter on display canvas
    applyFilterToContext(ctx, originalImage, w, h, activeFilter, parseFloat(sliderBlur.value), parseInt(sliderOpacity.value));
}

// Standard Filter engine that handles both display preview and full resolution rendering
function applyFilterToContext(ctx, img, width, height, filterType, blur, opacity) {
    if (filterType === "Flou") {
        ctx.filter = `blur(${blur}px)`;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.filter = 'none';
        return;
    }

    if (filterType === "Opacité") {
        ctx.globalAlpha = opacity / 255;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
        return;
    }

    // Default draw
    ctx.drawImage(img, 0, 0, width, height);

    if (filterType === "Aucun") return;

    // Pixel-level manipulations
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    switch (filterType) {
        case "Noir & Blanc":
            for (let i = 0; i < len; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const lum = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                const val = lum > 128 ? 255 : 0;
                data[i] = data[i+1] = data[i+2] = val;
            }
            ctx.putImageData(imgData, 0, 0);
            break;

        case "Sépia":
            for (let i = 0; i < len; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const tr = 0.393 * r + 0.769 * g + 0.189 * b;
                const tg = 0.349 * r + 0.686 * g + 0.168 * b;
                const tb = 0.272 * r + 0.534 * g + 0.131 * b;
                data[i] = Math.min(255, tr);
                data[i+1] = Math.min(255, tg);
                data[i+2] = Math.min(255, tb);
            }
            ctx.putImageData(imgData, 0, 0);
            break;

        case "Vert":
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.max(0, data[i] - 75);
                data[i+1] = Math.min(255, data[i+1] + 75);
                data[i+2] = Math.max(0, data[i+2] - 75);
            }
            ctx.putImageData(imgData, 0, 0);
            break;

        case "Rouge":
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.min(255, data[i] + 75);
                data[i+1] = Math.max(0, data[i+1] - 75);
                data[i+2] = Math.max(0, data[i+2] - 75);
            }
            ctx.putImageData(imgData, 0, 0);
            break;

        case "Bleu":
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.max(0, data[i] - 75);
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
                data[i] = 255 - data[i];
                data[i+1] = 255 - data[i+1];
                data[i+2] = 255 - data[i+2];
            }
            ctx.putImageData(imgData, 0, 0);
            break;

        case "Contours":
            const sobelData = applySobel(imgData);
            ctx.putImageData(sobelData, 0, 0);
            break;
    }
}

// Sobel Operator for contours
function applySobel(imgData) {
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;
    const output = new Uint8ClampedArray(data.length);
    
    const kX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let pX = 0;
            let pY = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const val = 0.2989 * data[idx] + 0.5870 * data[idx+1] + 0.1140 * data[idx+2];
                    const kidx = (ky + 1) * 3 + (kx + 1);
                    
                    pX += val * kX[kidx];
                    pY += val * kY[kidx];
                }
            }
            
            const mag = Math.sqrt(pX * pX + pY * pY);
            const outIdx = (y * width + x) * 4;
            const finalVal = mag > 255 ? 255 : mag;
            
            output[outIdx] = finalVal;
            output[outIdx + 1] = finalVal;
            output[outIdx + 2] = finalVal;
            output[outIdx + 3] = 255;
        }
    }
    
    for (let i = 0; i < output.length; i += 4) {
        if (output[i + 3] === 0) {
            output[i + 3] = 255;
        }
    }
    
    return new ImageData(output, width, height);
}

/* ----------------------------------------------------
   6. EXPORT / DOWNLOAD & RESET
   ---------------------------------------------------- */
btnSave.addEventListener('click', () => {
    if (!originalImage) return;

    // Export canvas at full natural resolution
    const exportCanvas = document.createElement('canvas');
    const w = originalImage.width;
    const h = originalImage.height;
    exportCanvas.width = w;
    exportCanvas.height = h;

    const ctx = exportCanvas.getContext('2d');
    
    let scaledBlur = parseFloat(sliderBlur.value);
    if (activeFilter === "Flou") {
        const displayW = imgOriginalSplit.clientWidth || w;
        const scaleRatio = w / displayW;
        scaledBlur = scaledBlur * scaleRatio;
    }

    applyFilterToContext(ctx, originalImage, w, h, activeFilter, scaledBlur, parseInt(sliderOpacity.value));

    const formatSuffix = activeFilter.toLowerCase().replace(/\s/g, '_');
    const suffix = formatSuffix !== 'aucun' ? `-${formatSuffix}` : '';
    
    const format = "image/png";
    const extension = "png";

    const link = document.createElement('a');
    link.download = `${originalFileName}${suffix}.${extension}`;
    link.href = exportCanvas.toDataURL(format, 1.0);
    link.click();
});

btnReset.addEventListener('click', async () => {
    const isApproved = await showConfirm("Réinitialiser l'éditeur", "Voulez-vous réinitialiser l'image et l'éditeur ? Cette action est irréversible.");
    if (isApproved) {
        originalImage = null;
        originalFileName = "image";
        
        fileInput.value = "";
        imgOriginalSplit.src = "";
        imgOriginalSide.src = "";
        
        // Reset file info
        fileNameText.textContent = "-";
        fileSizeText.textContent = "-";
        btnChangeImage.style.display = 'none';

        // Disable UI
        emptyState.classList.remove('hidden');
        imageViewer.classList.add('hidden');
        controlsSection.classList.add('disabled');
        btnSave.disabled = true;
        btnReset.disabled = true;

        resetFilterSelection();
    }
});

/* ----------------------------------------------------
   7. INITIALIZATION
   ---------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    checkUpdates();
});
