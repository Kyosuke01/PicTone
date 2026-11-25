'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, solid, px, near, openSolid, addSolidLayer, loadImage } = require('./harness');

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];

// Décode une data URL en Buffer.
const bytesOf = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
const isPng = (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isJpeg = (buf) => buf[0] === 0xff && buf[1] === 0xd8;

function pngFile(app, w, h, rgba, name = 'photo.png') {
    return new File([solid(app, w, h, rgba).toBuffer('image/png')], name, { type: 'image/png' });
}

// ---------------------------------------------------------------------------
// Noms de fichiers
// ---------------------------------------------------------------------------

test('baseName retire la dernière extension seulement', () => {
    const app = loadApp();
    assert.equal(app.run('baseName("photo.png")'), 'photo');
    assert.equal(app.run('baseName("mon.projet.pictone")'), 'mon.projet');
    assert.equal(app.run('baseName("sans-extension")'), 'sans-extension');
    assert.equal(app.run('baseName(".cache")'), '.cache');
});

test('exportFileName : nom du document, suffixe des filtres globaux, extension', () => {
    const app = loadApp();
    openSolid(app, 4, 4, RED, 'vacances');
    assert.equal(app.run('exportFileName("png")'), 'vacances.png');
    app.run('doc.globals.filters = ["Sépia", "Nuance de Gris"]');
    assert.equal(app.run('exportFileName("jpg")'), 'vacances-sépia_nuance_de_gris.jpg');
    app.run('doc.globals.filters = ["Aucun"]');
    assert.equal(app.run('exportFileName("webp")'), 'vacances.webp');
});

// ---------------------------------------------------------------------------
// Export de l'image (⇧⌘E) : cas qui échouait en 1.2.0 (exportFormat non déclaré)
// ---------------------------------------------------------------------------

test('exportImage : PNG par défaut, vraie image de la bonne taille, boîte « Enregistrer sous »', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'photo');
    assert.equal(await app.run('exportImage()'), true);
    assert.equal(app.saved.length, 1);
    assert.equal(app.saved[0].filename, 'photo.png');
    const buf = bytesOf(app.saved[0].dataUrl);
    assert.ok(isPng(buf), 'signature PNG');
    const img = await loadImage(buf);
    assert.deepEqual([img.width, img.height], [8, 6]);
});

test('exportImage : le contenu exporté contient les calques et les réglages globaux', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'photo');
    addSolidLayer(app, GREEN, 'Vert');
    app.run('doc.globals.filters = ["Négatif"]');
    await app.run('exportImage()');
    const img = await loadImage(bytesOf(app.saved[0].dataUrl));
    const c = app.run('blankCanvas(8, 6)');
    c.getContext('2d').drawImage(img, 0, 0);
    assert.deepEqual(px(c, 4, 3), [255, 0, 255, 255], 'négatif du vert');
});

test('exportImage : JPEG (extension .jpg) avec fond blanc à la place de la transparence', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, [0, 0, 0, 0], 'transparent');       // document entièrement transparent
    app.run('exportFormat = "jpeg"');
    await app.run('exportImage()');
    assert.equal(app.saved[0].filename, 'transparent.jpg');
    const buf = bytesOf(app.saved[0].dataUrl);
    assert.ok(isJpeg(buf), 'signature JPEG');
    const img = await loadImage(buf);
    const c = app.run('blankCanvas(8, 6)');
    c.getContext('2d').drawImage(img, 0, 0);
    assert.ok(near(px(c, 4, 3).slice(0, 3), [255, 255, 255], 3), `fond blanc attendu, obtenu ${px(c, 4, 3)}`);
});

test('exportImage : WebP', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'photo');
    app.run('exportFormat = "webp"');
    await app.run('exportImage()');
    assert.equal(app.saved[0].filename, 'photo.webp');
    assert.match(app.saved[0].dataUrl, /^data:image\/webp;base64,/);
});

test('exportImage : la rotation d\'aperçu est appliquée à l\'export', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'photo');
    app.ctx.rotation = 90;
    await app.run('exportImage()');
    const img = await loadImage(bytesOf(app.saved[0].dataUrl));
    assert.deepEqual([img.width, img.height], [6, 8]);
});

test('exportImage sans document : rien n\'est enregistré', async () => {
    const app = loadApp();
    assert.equal(await app.run('exportImage()'), false);
    assert.equal(app.saved.length, 0);
});

test('exportImage : si l\'utilisateur annule la boîte, renvoie false', async () => {
    const app = loadApp();
    openSolid(app, 4, 4, RED);
    app.api.save_file = async () => false;
    assert.equal(await app.run('exportImage()'), false);
});

test('exportImage : sans application native, retombe sur un téléchargement sans planter', async () => {
    const app = loadApp();
    openSolid(app, 4, 4, RED);
    app.ctx.window.pywebview = undefined;
    let clicked = null;
    app.ctx.document.createElement = (tag) => {
        if (tag === 'a') return { click() { clicked = this; } };
        return require('@napi-rs/canvas').createCanvas(1, 1);
    };
    assert.equal(await app.run('exportImage()'), true);
    assert.equal(clicked.download, 'test.png');
    assert.match(clicked.href, /^data:image\/png/);
});

// ---------------------------------------------------------------------------
// Projet .pictone : enregistrer puis rouvrir (cas signalé : rien n'était restauré)
// ---------------------------------------------------------------------------

async function savedProjectFile(app, filename = 'projet.pictone') {
    const dataUrl = app.saved[app.saved.length - 1].dataUrl;
    return new File([bytesOf(dataUrl)], filename, { type: '' });
}

test('saveProject : écrit un JSON PicTone avec la boîte « Enregistrer sous » et marque le document enregistré', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'projet');
    addSolidLayer(app, GREEN, 'Vert');
    assert.equal(app.run('isDirty()'), true);
    assert.equal(await app.run('saveProject()'), true);
    assert.equal(app.saved[0].filename, 'projet.pictone');
    const data = JSON.parse(bytesOf(app.saved[0].dataUrl).toString('utf8'));
    assert.equal(data.format, 'pictone');
    assert.equal(data.layers.length, 2);
    assert.equal(app.run('isDirty()'), false);
});

test('saveProject annulé : le document reste « modifié »', async () => {
    const app = loadApp();
    openSolid(app, 4, 4, RED);
    app.run('addLayer()');
    app.api.save_file = async () => false;
    assert.equal(await app.run('saveProject()'), false);
    assert.equal(app.run('isDirty()'), true);
});

test('enregistrer puis rouvrir un projet : tout est restauré (calques, pixels, réglages, opacité, visibilité)', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'projet');
    addSolidLayer(app, GREEN, 'Vert');
    app.run('activeLayer().opacity = 0.5; activeLayer().settings.filters = ["Sépia"]; doc.globals.brightness = 10; doc.layers[0].visible = false;');
    app.run('commit()');
    await app.run('saveProject()');
    const file = await savedProjectFile(app);

    // On repart d'une application vide, comme au lancement.
    const reopened = loadApp();
    await reopened.run('undefined');
    reopened.ctx.__file = file;
    await reopened.run('openFile(__file)');
    assert.equal(reopened.alerts.length, 0, `aucune erreur attendue : ${reopened.alerts}`);
    assert.equal(reopened.run('hasDoc()'), true, 'le document est ouvert');
    assert.deepEqual(Array.from(reopened.run('doc.layers.map((l) => l.name)')), ['Fond', 'Vert']);
    assert.equal(reopened.run('doc.name'), 'projet');
    assert.deepEqual(px(reopened.run('doc.layers[0].canvas'), 3, 3), RED);
    assert.deepEqual(px(reopened.run('doc.layers[1].canvas'), 3, 3), GREEN);
    assert.equal(reopened.run('doc.layers[1].opacity'), 0.5);
    assert.equal(reopened.run('doc.layers[0].visible'), false);
    assert.deepEqual(Array.from(reopened.run('doc.layers[1].settings.filters')), ['Sépia']);
    assert.equal(reopened.run('doc.globals.brightness'), 10);
    assert.equal(reopened.run('isDirty()'), false, 'un projet qui vient d\'être ouvert n\'est pas « modifié »');
});

test('ouvrir un projet par-dessus un document modifié : demande confirmation, et respecte le refus', async () => {
    const app = loadApp();
    openSolid(app, 8, 6, RED, 'projet');
    await app.run('saveProject()');
    const file = await savedProjectFile(app);
    openSolid(app, 3, 3, GREEN, 'autre');
    app.run('addLayer()');                               // document modifié
    app.state.confirm = false;
    app.ctx.__file = file;
    await app.run('openFile(__file)');
    assert.equal(app.run('doc.name'), 'autre', 'refus : le document en cours est conservé');
    app.state.confirm = true;
    await app.run('openFile(__file)');
    assert.equal(app.run('doc.name'), 'projet');
});

test('ouvrir un fichier .pictone corrompu : message d\'erreur, document en cours conservé', async () => {
    const app = loadApp();
    openSolid(app, 4, 4, RED, 'courant');
    app.ctx.__file = new File(['ceci n\'est pas du JSON'], 'cassé.pictone');
    await app.run('openFile(__file)');
    assert.equal(app.alerts.length, 1);
    assert.match(app.alerts[0], /Projet illisible/);
    assert.equal(app.run('doc.name'), 'courant');
    app.ctx.__file = new File(['{"format":"autre"}'], 'autre.pictone');
    await app.run('openFile(__file)');
    assert.equal(app.alerts.length, 2);
    assert.equal(app.run('doc.name'), 'courant');
});

// ---------------------------------------------------------------------------
// Ouverture d'images, calques, collage
// ---------------------------------------------------------------------------

test('openFile : une image devient un document « Fond » enregistré', async () => {
    const app = loadApp();
    app.ctx.__file = pngFile(app, 10, 7, RED, 'vacances.png');
    await app.run('openFile(__file)');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [10, 7]);
    assert.equal(app.run('doc.name'), 'vacances');
    assert.deepEqual(Array.from(app.run('doc.layers.map((l) => l.name)')), ['Fond']);
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 5, 3), RED);
    assert.equal(app.run('isDirty()'), false);
});

test('openFile : un fichier qui n\'est pas une image est refusé avec un message', async () => {
    const app = loadApp();
    app.ctx.__file = new File(['texte'], 'notes.txt', { type: 'text/plain' });
    await app.run('openFile(__file)');
    assert.equal(app.run('hasDoc()'), false);
    assert.match(app.alerts[0], /Format non supporté/);
});

test('openFile : une image illisible est signalée', async () => {
    const app = loadApp();
    app.ctx.__file = new File([Buffer.from('pas une image')], 'faux.png', { type: 'image/png' });
    await app.run('openFile(__file)');
    assert.equal(app.run('hasDoc()'), false);
    assert.match(app.alerts[0], /Ouverture impossible/);
});

test('addImageFromFile : l\'image devient un calque centré, rogné à la taille du document', async () => {
    const app = loadApp();
    openSolid(app, 10, 10, RED, 'doc');
    app.ctx.__file = pngFile(app, 4, 4, GREEN, 'petit.png');
    await app.run('addImageFromFile(__file)');
    assert.deepEqual(Array.from(app.run('doc.layers.map((l) => l.name)')), ['Fond', 'petit']);
    const c = app.run('doc.layers[1].canvas');
    assert.deepEqual([c.width, c.height], [10, 10]);
    assert.deepEqual(px(c, 5, 5), GREEN, 'centre');
    assert.deepEqual(px(c, 0, 0), [0, 0, 0, 0], 'coin transparent');
    // Image plus grande que le document : le calque garde la taille du document.
    app.ctx.__file = pngFile(app, 30, 30, GREEN, 'grand.png');
    await app.run('addImageFromFile(__file)');
    const big = app.run('doc.layers[2].canvas');
    assert.deepEqual([big.width, big.height], [10, 10]);
    assert.deepEqual(px(big, 0, 0), GREEN);
});

test('addImageFromFile sans document : ouvre l\'image', async () => {
    const app = loadApp();
    app.ctx.__file = pngFile(app, 5, 5, RED, 'seule.png');
    await app.run('addImageFromFile(__file)');
    assert.equal(app.run('doc.name'), 'seule');
});

test('pasteFromClipboard : une image du presse-papiers devient un calque (centré)', async () => {
    const app = loadApp();
    openSolid(app, 10, 10, RED, 'doc');
    const rgba = Buffer.alloc(2 * 2 * 4);
    for (let i = 0; i < 4; i++) rgba.set([0, 255, 0, 255], i * 4);
    app.api.read_clipboard_image = async () => ({ width: 2, height: 2, rgba: rgba.toString('base64') });
    await app.run('pasteFromClipboard()');
    assert.deepEqual(Array.from(app.run('doc.layers.map((l) => l.name)')), ['Fond', 'Calque collé']);
    assert.deepEqual(px(app.run('doc.layers[1].canvas'), 5, 5), GREEN);
});

test('pasteFromClipboard sans document : crée le document', async () => {
    const app = loadApp();
    const rgba = Buffer.alloc(3 * 2 * 4, 255);
    app.api.read_clipboard_image = async () => ({ width: 3, height: 2, rgba: rgba.toString('base64') });
    await app.run('pasteFromClipboard()');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [3, 2]);
    assert.equal(app.run('doc.name'), 'image-collee');
});

test('pasteFromClipboard : presse-papiers sans image → message', async () => {
    const app = loadApp();
    app.api.read_clipboard_image = async () => null;
    await app.run('pasteFromClipboard()');
    assert.match(app.alerts[0], /Aucune image/);
    assert.equal(app.run('hasDoc()'), false);
});

test('fileFromDataUrl : reconstruit un fichier identique à l\'original', async () => {
    const app = loadApp();
    const original = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const url = `data:image/png;base64,${original.toString('base64')}`;
    app.ctx.__url = url;
    const file = app.run('fileFromDataUrl(__url, "x.png", "image/png")');
    assert.equal(file.name, 'x.png');
    assert.equal(file.type, 'image/png');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), original);
});

test('onWhiteBackground : fond blanc opaque derrière les pixels transparents, couleurs opaques intactes', () => {
    const app = loadApp();
    const c = app.run('blankCanvas(4, 2)');
    c.getContext('2d').fillStyle = '#ff0000';
    c.getContext('2d').fillRect(0, 0, 2, 2);
    app.ctx.__c = c;
    const out = app.run('onWhiteBackground(__c)');
    assert.deepEqual(px(out, 0, 0), RED);
    assert.deepEqual(px(out, 3, 1), [255, 255, 255, 255]);
});
