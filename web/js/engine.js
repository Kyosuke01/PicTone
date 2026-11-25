/* ==========================================================================
   PicTone — moteur de rendu : filtres de pixels, flou, contours, réglages.
   Un « réglage » (settings) = { filters, blur, filterOpacity, brightness, contrast, saturation }.
   Il s'applique soit à un calque, soit à l'image entière (fusion des calques).
   ========================================================================== */

const FILTER_NAMES = ['Aucun', 'Noir & Blanc', 'Sépia', 'Flou', 'Contours', 'Opacité', 'Vert', 'Rouge', 'Bleu',
    'Nuance de Gris', 'Négatif', 'Vivid', 'Cinématique', 'Aquarelle'];

function defaultSettings() {
    return { filters: ['Aucun'], blur: 5, filterOpacity: 255, brightness: 0, contrast: 0, saturation: 0 };
}

function cloneSettings(s) {
    return { ...s, filters: [...s.filters] };
}

// Vrai si le réglage ne change rien à l'image (inutile de le calculer).
function isNeutralSettings(s) {
    const noFilter = s.filters.every((f) => f === 'Aucun');
    return noFilter && s.brightness === 0 && s.contrast === 0 && s.saturation === 0;
}

function blankCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
}

function cloneCanvas(src) {
    const c = blankCanvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
}

// Filtres de pixels « simples » (une seule passe sur les données de l'image).
function applyPixelFilter(ctx, type, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    switch (type) {
        case 'Noir & Blanc':
            for (let i = 0; i < len; i += 4) {
                const lum = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
                const val = lum > 128 ? 255 : 0;
                data[i] = data[i + 1] = data[i + 2] = val;
            }
            break;
        case 'Sépia':
            for (let i = 0; i < len; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                data[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
                data[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
                data[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
            }
            break;
        case 'Vert':
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.max(0, data[i] - 75);
                data[i + 1] = Math.min(255, data[i + 1] + 75);
                data[i + 2] = Math.max(0, data[i + 2] - 75);
            }
            break;
        case 'Rouge':
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.min(255, data[i] + 75);
                data[i + 1] = Math.max(0, data[i + 1] - 75);
                data[i + 2] = Math.max(0, data[i + 2] - 75);
            }
            break;
        case 'Bleu':
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.max(0, data[i] - 75);
                data[i + 1] = Math.max(0, data[i + 1] - 75);
                data[i + 2] = Math.min(255, data[i + 2] + 75);
            }
            break;
        case 'Nuance de Gris':
            for (let i = 0; i < len; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = data[i + 1] = data[i + 2] = avg;
            }
            break;
        case 'Négatif':
            for (let i = 0; i < len; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
            break;
        case 'Contours':
            ctx.putImageData(applySobel(imgData), 0, 0);
            return;
        case 'Vivid':
            for (let i = 0; i < len; i += 4) {
                data[i] = Math.min(255, data[i] * 1.2);
                data[i + 1] = Math.min(255, data[i + 1] * 1.15);
                data[i + 2] = Math.min(255, data[i + 2] * 0.85);
            }
            break;
        case 'Cinématique':
            for (let i = 0; i < len; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                data[i] = Math.min(255, r * 0.9 + 20);
                data[i + 1] = Math.min(255, g * 0.85 + 10);
                data[i + 2] = Math.min(255, b * 1.1);
            }
            break;
        case 'Aquarelle':
            for (let i = 0; i < len; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const lum = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                data[i] = Math.min(255, r * 0.6 + lum * 0.5 + 30);
                data[i + 1] = Math.min(255, g * 0.6 + lum * 0.5 + 30);
                data[i + 2] = Math.min(255, b * 0.8 + lum * 0.3 + 50);
            }
            break;
        default:
            return;
    }
    ctx.putImageData(imgData, 0, 0);
}

// Applique un réglage complet à un contexte de canevas (taille width × height).
// scale : rapport entre la taille de ce canevas et l'image d'origine (pour que le flou reste proportionné).
function applySettingsToContext(ctx, width, height, settings, scale = 1) {
    for (const filter of settings.filters) {
        if (filter === 'Aucun') continue;
        if (filter === 'Flou') {
            const radius = settings.blur * scale;
            if (!canvasFilterBlurWorks()) {
                gaussianBlurCanvas(ctx, width, height, radius); // WebKit : pas de ctx.filter
            } else {
                const copy = cloneCanvas(ctx.canvas);
                ctx.clearRect(0, 0, width, height);
                ctx.save();
                ctx.filter = `blur(${radius}px)`;
                ctx.drawImage(copy, 0, 0);
                ctx.restore();
            }
        } else if (filter === 'Opacité') {
            const copy = cloneCanvas(ctx.canvas);
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            ctx.globalAlpha = settings.filterOpacity / 255;
            ctx.drawImage(copy, 0, 0);
            ctx.restore();
        } else {
            applyPixelFilter(ctx, filter, width, height);
        }
    }
    applyAdjustmentsToContext(ctx, width, height, settings);
}

// Luminosité, contraste, saturation.
function applyAdjustmentsToContext(ctx, width, height, settings) {
    const { brightness, contrast, saturation } = settings;
    if (brightness === 0 && contrast === 0 && saturation === 0) return;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < len; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];
        r += brightness; g += brightness; b += brightness;
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;
        if (saturation !== 0) {
            const avg = (r + g + b) / 3;
            const s = saturation / 100;
            r = avg + (r - avg) * (1 + s);
            g = avg + (g - avg) * (1 + s);
            b = avg + (b - avg) * (1 + s);
        }
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imgData, 0, 0);
}

// Flou : le filtre natif du canvas (ctx.filter) est ignoré par Safari / WKWebView (macOS) : la propriété
// accepte « blur(5px) » mais ne floute rien. On vérifie donc l'effet réel, et sinon on calcule un flou
// gaussien (3 passes de flou par boîte) en JavaScript.
// ---------------------------------------------------------------------------

let canvasBlurWorks = null;
function canvasFilterBlurWorks() {
    if (canvasBlurWorks !== null) return canvasBlurWorks;
    try {
        const src = document.createElement('canvas');
        src.width = src.height = 20;
        const sx = src.getContext('2d');
        sx.fillStyle = '#000'; sx.fillRect(0, 0, 20, 20);
        sx.fillStyle = '#fff'; sx.fillRect(10, 0, 10, 20);
        const dst = document.createElement('canvas');
        dst.width = dst.height = 20;
        const dx = dst.getContext('2d');
        dx.filter = 'blur(3px)';
        dx.drawImage(src, 0, 0);
        const edge = dx.getImageData(9, 10, 2, 1).data;
        canvasBlurWorks = edge[0] > 0 && edge[0] < 255; // le bord noir/blanc doit être adouci
    } catch (e) {
        canvasBlurWorks = false;
    }
    return canvasBlurWorks;
}

// Tailles de boîtes dont 3 passes approchent un flou gaussien d'écart-type sigma
function boxesForGauss(sigma, n) {
    const ideal = Math.sqrt((12 * sigma * sigma / n) + 1);
    let lower = Math.floor(ideal);
    if (lower % 2 === 0) lower--;
    const upper = lower + 2;
    const m = Math.round((12 * sigma * sigma - n * lower * lower - 4 * n * lower - 3 * n) / (-4 * lower - 4));
    return Array.from({ length: n }, (_, i) => (i < m ? lower : upper));
}

// Flou par boîte le long d'un axe (bords prolongés), de src vers dst
function boxBlurAxis(src, dst, len, lines, lineStride, step, r) {
    const inv = 1 / (2 * r + 1);
    const last = len - 1;
    for (let l = 0; l < lines; l++) {
        const base = l * lineStride;
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[base + Math.min(Math.max(k, 0), last) * step];
        for (let i = 0; i < len; i++) {
            dst[base + i * step] = sum * inv;
            sum += src[base + Math.min(i + r + 1, last) * step] - src[base + Math.max(i - r, 0) * step];
        }
    }
}

function gaussianBlurCanvas(ctx, width, height, sigma) {
    if (!(sigma > 0) || width < 1 || height < 1) return;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const count = width * height;
    // Canaux prémultipliés par l'alpha : un bord transparent ne « bave » pas sur les couleurs
    const channels = [0, 1, 2, 3].map(() => new Float32Array(count));
    for (let i = 0, p = 0; i < count; i++, p += 4) {
        const a = data[p + 3] / 255;
        channels[0][i] = data[p] * a;
        channels[1][i] = data[p + 1] * a;
        channels[2][i] = data[p + 2] * a;
        channels[3][i] = data[p + 3];
    }
    const tmp = new Float32Array(count);
    const sizes = boxesForGauss(sigma, 3);
    for (const channel of channels) {
        for (const size of sizes) {
            const r = (size - 1) / 2;
            boxBlurAxis(channel, tmp, width, height, width, 1, r);   // horizontal
            boxBlurAxis(tmp, channel, height, width, 1, width, r);   // vertical
        }
    }
    for (let i = 0, p = 0; i < count; i++, p += 4) {
        const a = channels[3][i];
        const k = a > 0 ? 255 / a : 0;
        data[p] = channels[0][i] * k;
        data[p + 1] = channels[1][i] * k;
        data[p + 2] = channels[2][i] * k;
        data[p + 3] = a;
    }
    ctx.putImageData(image, 0, 0);
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


