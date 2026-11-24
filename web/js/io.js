/* ==========================================================================
   PicTone — entrées-sorties : ouvrir, coller, glisser-déposer, projet .pictone,
   export de l'image, copie dans le presse-papiers.
   ========================================================================== */

const PROJECT_EXT = '.pictone';

function nativeApi() {
    return window.pywebview && window.pywebview.api;
}

function baseName(filename) {
    const i = filename.lastIndexOf('.');
    return i > 0 ? filename.slice(0, i) : filename;
}

function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function readAsText(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

// Image (élément <img>) depuis un canevas.
function imageFromCanvas(canvas) {
    return loadImageFrom(canvas.toDataURL('image/png'));
}

// Nouveau document à partir d'une image (une seule couche, considérée comme enregistrée).
function documentFromImage(img, name) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = blankCanvas(w, h);
    canvas.getContext('2d').drawImage(img, 0, 0);
    const layer = makeLayer('Fond', canvas);
    touch(layer);
    setDocument({ w, h, name, layers: [layer], saved: true });
}

// Ajoute une image comme nouveau calque, centrée sur le document (rognée si elle est plus grande).
function addImageLayer(img, name) {
    const canvas = blankCanvas(doc.w, doc.h);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    canvas.getContext('2d').drawImage(img, Math.round((doc.w - iw) / 2), Math.round((doc.h - ih) / 2), iw, ih);
    addLayer(canvas, name);
}

// Confirme avant de remplacer un document non enregistré.
async function confirmReplaceDocument() {
    if (!isDirty()) return true;
    return showConfirm('Remplacer le document ?',
        'Le document en cours contient des modifications non enregistrées. Les ouvrir remplacera ce travail.');
}

async function openFile(file) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(PROJECT_EXT)) {
        await openProjectFile(file);
        return;
    }
    if (!file.type.match('image.*')) {
        await showAlert('Format non supporté', 'Choisissez une image (PNG, JPEG, BMP, WebP, GIF) ou un projet PicTone.');
        return;
    }
    if (!(await confirmReplaceDocument())) return;
    try {
        const img = await loadImageFrom(await readAsDataURL(file));
        documentFromImage(img, baseName(file.name));
    } catch (e) {
        await showAlert('Ouverture impossible', `Cette image ne peut pas être ouverte : ${e.message}`);
    }
}

// Ajoute une image comme calque (si un document est ouvert), sinon l'ouvre.
async function addImageFromFile(file) {
    if (!file || !file.type.match('image.*')) return;
    if (!hasDoc()) return openFile(file);
    try {
        const img = await loadImageFrom(await readAsDataURL(file));
        addImageLayer(img, baseName(file.name));
    } catch (e) {
        await showAlert('Calque impossible', `Cette image ne peut pas être ajoutée : ${e.message}`);
    }
}

async function openProjectFile(file) {
    if (!(await confirmReplaceDocument())) return;
    try {
        const data = JSON.parse(await readAsText(file));
        setDocument(await documentFromProject(data));
    } catch (e) {
        await showAlert('Projet illisible', e.message || "Ce fichier n'est pas un projet PicTone valide.");
    }
}

// Coller (⌘V / Ctrl+V) : une image du presse-papiers devient un calque, ou le document si rien n'est ouvert.
async function pasteFromClipboard() {
    const api = nativeApi();
    if (!api || typeof api.read_clipboard_image !== 'function') return;
    let image = null;
    try { image = await api.read_clipboard_image(); } catch (e) { image = null; }
    if (!image) {
        await showAlert('Coller', 'Aucune image dans le presse-papiers.');
        return;
    }
    const bytes = Uint8ClampedArray.from(atob(image.rgba), (c) => c.charCodeAt(0));
    const canvas = blankCanvas(image.width, image.height);
    canvas.getContext('2d').putImageData(new ImageData(bytes, image.width, image.height), 0, 0);
    const img = await imageFromCanvas(canvas);
    if (hasDoc()) {
        addImageLayer(img, 'Calque collé');
    } else {
        documentFromImage(img, 'image-collee');
    }
}

// Nom de fichier d'export : image + suffixe des filtres (comme avant).
function exportFileName(ext) {
    const list = doc.globals.filters.filter((f) => f !== 'Aucun');
    const suffix = list.length ? '-' + list.join('_').toLowerCase().replace(/\s/g, '_') : '';
    return `${doc.name}${suffix}.${ext}`;
}

// Image rendue à pleine résolution (calques, réglages, rotation d'aperçu).
function renderFullImage() {
    return rotateCanvas(renderComposite(doc.w, doc.h, true), rotation);
}

// Export image (PNG, JPEG, WebP) : toujours avec la boîte « Enregistrer sous ».
async function exportImage() {
    if (!hasDoc()) return false;
    const ext = { png: 'png', jpeg: 'jpg', webp: 'webp' }[exportFormat] || 'png';
    const canvas = renderFullImage();
    const dataUrl = canvas.toDataURL(`image/${exportFormat}`, exportFormat === 'png' ? 1.0 : exportQuality);
    return saveDataUrl(dataUrl, exportFileName(ext));
}

// Projet .pictone : toujours avec la boîte « Enregistrer sous » (aucune réécriture silencieuse).
async function saveProject() {
    if (!hasDoc()) return false;
    const json = JSON.stringify(projectData());
    const dataUrl = await readAsDataURL(new Blob([json], { type: 'application/json' }));
    const saved = await saveDataUrl(dataUrl, `${doc.name}${PROJECT_EXT}`);
    if (saved) markSaved();
    return saved;
}

// Écrit un fichier : boîte native sous l'application, téléchargement dans un navigateur.
async function saveDataUrl(dataUrl, filename) {
    const api = nativeApi();
    if (api && typeof api.save_file === 'function') {
        try {
            return !!(await api.save_file(dataUrl, filename));
        } catch (err) {
            console.error('Enregistrement natif impossible, téléchargement :', err);
        }
    }
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
    return true;
}

// Copie de l'image rendue dans le presse-papiers (fonctionne aussi sur macOS).
async function copyImageToClipboard() {
    if (!hasDoc()) return;
    try {
        const blob = await new Promise((resolve) => renderFullImage().toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        updLog('image copiée dans le presse-papiers');
    } catch (e) {
        const message = e && e.message ? e.message : String(e);
        updLog(`ÉCHEC de la copie : ${message}`);
        await showAlert('Copier', `Impossible de copier l'image : ${message}`);
    }
}
