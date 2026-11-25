'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, solid, px, near, openSolid, addSolidLayer } = require('./harness');

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];

// Application neuve avec un document 8×6 rouge.
function fresh() {
    const app = loadApp();
    openSolid(app, 8, 6, RED);
    return app;
}
const names = (app) => Array.from(app.run('doc.layers.map((l) => l.name)'));
const selected = (app) => Array.from(app.run('selectedLayers().map((l) => l.name)'));

// ---------------------------------------------------------------------------
// Document et calques
// ---------------------------------------------------------------------------

test('document neuf : un calque « Fond », actif et sélectionné, enregistré', () => {
    const app = fresh();
    assert.deepEqual(names(app), ['Fond']);
    assert.equal(app.run('hasDoc()'), true);
    assert.deepEqual(selected(app), ['Fond']);
    assert.equal(app.run('isDirty()'), false);
    assert.equal(app.run('canUndo()'), false);
});

test('addLayer : le nouveau calque est au-dessus du calque actif, actif, seul sélectionné', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    addSolidLayer(app, BLUE, 'Bleu');
    app.run('selectLayer(doc.layers[0].id)');          // on revient sur le fond
    app.run('addLayer(null, "Inséré")');
    assert.deepEqual(names(app), ['Fond', 'Inséré', 'Vert', 'Bleu']);
    assert.deepEqual(selected(app), ['Inséré']);
    assert.equal(app.run('activeLayer().name'), 'Inséré');
    assert.equal(app.run('isDirty()'), true);
});

test('addLayer sans document : ne fait rien', () => {
    const app = loadApp();
    assert.equal(app.run('addLayer()'), null);
    assert.equal(app.run('doc.layers.length'), 0);
});

test('un calque vide est transparent, à la taille du document', () => {
    const app = fresh();
    app.run('addLayer()');
    const c = app.run('activeLayer().canvas');
    assert.deepEqual([c.width, c.height], [8, 6]);
    assert.deepEqual(px(c, 3, 3), [0, 0, 0, 0]);
});

test('duplicateLayer : copie les pixels, la visibilité, l\'opacité et les réglages, sans lien avec l\'original', () => {
    const app = fresh();
    app.run('activeLayer().opacity = 0.4; activeLayer().settings.brightness = 20;');
    app.run('duplicateLayer()');
    assert.deepEqual(names(app), ['Fond', 'Fond copie']);
    assert.equal(app.run('activeLayer().opacity'), 0.4);
    assert.equal(app.run('activeLayer().settings.brightness'), 20);
    assert.deepEqual(px(app.run('activeLayer().canvas'), 2, 2), RED);
    // Modifier la copie ne touche pas l'original
    app.run('activeLayer().canvas.getContext("2d").clearRect(0, 0, 8, 6); activeLayer().settings.brightness = 99;');
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 2, 2), RED);
    assert.equal(app.run('doc.layers[0].settings.brightness'), 20);
});

test('renameLayer : renomme, ignore un nom vide', () => {
    const app = fresh();
    const id = app.run('doc.layers[0].id');
    app.run(`renameLayer(${id}, "  Arrière-plan  ")`);
    assert.deepEqual(names(app), ['Arrière-plan']);
    app.run(`renameLayer(${id}, "   ")`);
    assert.deepEqual(names(app), ['Arrière-plan']);
});

test('moveLayer : monte et descend, sans sortir de la pile', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    addSolidLayer(app, BLUE, 'Bleu');
    app.run('selectLayer(doc.layers[0].id)');
    app.run('moveLayer(1)');
    assert.deepEqual(names(app), ['Vert', 'Fond', 'Bleu']);
    app.run('moveLayer(-1)');
    assert.deepEqual(names(app), ['Fond', 'Vert', 'Bleu']);
    app.run('moveLayer(-1)');                          // déjà tout en bas
    assert.deepEqual(names(app), ['Fond', 'Vert', 'Bleu']);
    app.run('selectLayer(doc.layers[2].id); moveLayer(1)');   // déjà tout en haut
    assert.deepEqual(names(app), ['Fond', 'Vert', 'Bleu']);
});

test('setLayerVisible et setLayerOpacity', () => {
    const app = fresh();
    const id = app.run('doc.layers[0].id');
    app.run(`setLayerVisible(${id}, false)`);
    assert.equal(app.run('doc.layers[0].visible'), false);
    app.run(`setLayerOpacity(${id}, 1.7, true)`);
    assert.equal(app.run('doc.layers[0].opacity'), 1, 'opacité bornée à 1');
    app.run(`setLayerOpacity(${id}, -3, true)`);
    assert.equal(app.run('doc.layers[0].opacity'), 0, 'opacité bornée à 0');
});

// ---------------------------------------------------------------------------
// Sélection multiple
// ---------------------------------------------------------------------------

function fiveLayers() {
    const app = fresh();                               // Fond
    for (const n of ['A', 'B', 'C', 'D']) addSolidLayer(app, GREEN, n);
    return app;                                        // Fond, A, B, C, D (D au-dessus)
}
const idOf = (app, name) => app.run(`doc.layers.find((l) => l.name === ${JSON.stringify(name)}).id`);

test('clic simple : sélectionne ce calque seul', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'B')})`);
    assert.deepEqual(selected(app), ['B']);
    assert.equal(app.run('activeLayer().name'), 'B');
});

test('Maj + clic : sélectionne tous les calques entre le point de départ et le calque cliqué', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'A')})`);
    app.run(`selectLayer(${idOf(app, 'C')}, { range: true })`);
    assert.deepEqual(selected(app), ['A', 'B', 'C']);
    assert.equal(app.run('activeLayer().name'), 'C');
});

test('Maj + clic vers le bas : même plage, dans l\'autre sens', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'D')})`);
    app.run(`selectLayer(${idOf(app, 'B')}, { range: true })`);
    assert.deepEqual(selected(app), ['B', 'C', 'D']);
});

test('Maj + clic répété : la plage repart toujours du même point de départ', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'B')})`);
    app.run(`selectLayer(${idOf(app, 'D')}, { range: true })`);
    app.run(`selectLayer(${idOf(app, 'Fond')}, { range: true })`);
    assert.deepEqual(selected(app), ['Fond', 'A', 'B'], 'B est le point de départ, pas D');
});

test('⌘/Ctrl + clic : ajoute puis retire des calques un par un', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'Fond')})`);
    app.run(`selectLayer(${idOf(app, 'B')}, { toggle: true })`);
    app.run(`selectLayer(${idOf(app, 'D')}, { toggle: true })`);
    assert.deepEqual(selected(app), ['Fond', 'B', 'D']);
    app.run(`selectLayer(${idOf(app, 'B')}, { toggle: true })`);   // retire B
    assert.deepEqual(selected(app), ['Fond', 'D']);
});

test('⌘/Ctrl + clic sur le calque actif : un autre calque sélectionné devient actif', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'A')})`);
    app.run(`selectLayer(${idOf(app, 'C')}, { toggle: true })`);   // actif : C
    app.run(`selectLayer(${idOf(app, 'C')}, { toggle: true })`);   // on retire C
    assert.deepEqual(selected(app), ['A']);
    assert.equal(app.run('activeLayer().name'), 'A');
});

test('⌘/Ctrl + clic sur l\'unique calque sélectionné : il reste sélectionné', () => {
    const app = fiveLayers();
    const d = idOf(app, 'D');
    app.run(`selectLayer(${d}, { toggle: true })`);
    assert.deepEqual(selected(app), ['D']);
});

test('selectAllLayers sélectionne tout', () => {
    const app = fiveLayers();
    app.run('selectAllLayers()');
    assert.equal(selected(app).length, 5);
});

test('la sélection est remise à un seul calque par un nouveau calque et par annuler', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'Fond')}); selectLayer(${idOf(app, 'B')}, { range: true })`);
    assert.equal(selected(app).length, 3);
    app.run('addLayer()');
    assert.equal(selected(app).length, 1);
    app.run('selectAllLayers(); undo()');
    assert.equal(selected(app).length, 1, 'après annuler, seul le calque actif est sélectionné');
});

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

test('deleteSelectedLayers : supprime tous les calques sélectionnés et active un voisin', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'A')}); selectLayer(${idOf(app, 'B')}, { range: true })`);
    assert.equal(app.run('deleteSelectedLayers()'), 2);
    assert.deepEqual(names(app), ['Fond', 'C', 'D']);
    assert.equal(app.run('activeLayer().name'), 'Fond', 'le calque juste sous la sélection devient actif');
    assert.deepEqual(selected(app), ['Fond']);
});

test('deleteSelectedLayers : le calque du fond supprimé, le suivant devient actif', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'A');
    app.run('selectLayer(doc.layers[0].id)');
    assert.equal(app.run('deleteSelectedLayers()'), 1);
    assert.deepEqual(names(app), ['A']);
    assert.equal(app.run('activeLayer().name'), 'A');
});

test('deleteSelectedLayers : refuse de supprimer tous les calques', () => {
    const app = fiveLayers();
    app.run('selectAllLayers()');
    assert.equal(app.run('deleteSelectedLayers()'), 0);
    assert.equal(app.run('doc.layers.length'), 5);
});

test('deleteSelectedLayers sur un document à un seul calque : rien', () => {
    const app = fresh();
    assert.equal(app.run('deleteSelectedLayers()'), 0);
    assert.equal(app.run('doc.layers.length'), 1);
});

test('la suppression s\'annule', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'B')}); deleteSelectedLayers(); undo()`);
    assert.deepEqual(names(app), ['Fond', 'A', 'B', 'C', 'D']);
});

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

test('mergeSelectedLayers : fusionne seulement les calques sélectionnés, résultat à la place du plus haut', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'A')}); selectLayer(${idOf(app, 'B')}, { range: true })`);
    assert.equal(app.run('mergeSelectedLayers()'), 2);
    assert.deepEqual(names(app), ['Fond', 'B', 'C', 'D'], 'le résultat porte le nom du calque le plus haut');
    assert.equal(app.run('activeLayer().name'), 'B');
    assert.deepEqual(selected(app), ['B']);
});

test('mergeSelectedLayers : le résultat mélange réellement les pixels (opacité 50 % de vert sur rouge)', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('activeLayer().opacity = 0.5');
    app.run('selectLayer(doc.layers[0].id); selectLayer(doc.layers[1].id, { range: true })');
    app.run('mergeSelectedLayers()');
    assert.equal(app.run('doc.layers.length'), 1);
    assert.ok(near(px(app.run('doc.layers[0].canvas'), 3, 3), [127, 128, 0, 255], 2), JSON.stringify(px(app.run('doc.layers[0].canvas'), 3, 3)));
    assert.equal(app.run('doc.layers[0].opacity'), 1, 'l\'opacité est intégrée aux pixels');
});

test('mergeSelectedLayers : les réglages du calque sont intégrés (Négatif du vert = magenta)', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('activeLayer().settings.filters = ["Négatif"]');
    app.run('selectLayer(doc.layers[0].id); selectLayer(doc.layers[1].id, { range: true }); mergeSelectedLayers()');
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 1, 1), [255, 0, 255, 255]);
    assert.equal(app.run('isNeutralSettings(doc.layers[0].settings)'), true);
});

test('mergeSelectedLayers : un calque masqué n\'est pas fusionné et reste en place', () => {
    const app = fiveLayers();
    app.run(`setLayerVisible(${idOf(app, 'B')}, false)`);
    app.run(`selectLayer(${idOf(app, 'A')}); selectLayer(${idOf(app, 'C')}, { range: true })`);
    assert.equal(app.run('mergeSelectedLayers()'), 2, 'A et C seulement');
    assert.deepEqual(names(app), ['Fond', 'B', 'C', 'D']);
    assert.equal(app.run('doc.layers.find((l) => l.name === "B").visible'), false);
});

test('mergeSelectedLayers : moins de deux calques visibles sélectionnés → rien', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'B')})`);
    assert.equal(app.run('mergeSelectedLayers()'), 0);
    assert.equal(app.run('doc.layers.length'), 5);
    assert.equal(app.run('mergeableLayers().length'), 1);
});

test('la fusion s\'annule', () => {
    const app = fiveLayers();
    app.run(`selectLayer(${idOf(app, 'A')}); selectLayer(${idOf(app, 'C')}, { range: true }); mergeSelectedLayers(); undo()`);
    assert.deepEqual(names(app), ['Fond', 'A', 'B', 'C', 'D']);
});

test('flattenLayers : une seule couche, calques masqués abandonnés', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    addSolidLayer(app, BLUE, 'Bleu');
    app.run('setLayerVisible(doc.layers[1].id, false)');       // le vert est masqué
    assert.equal(app.run('flattenLayers()'), 2);
    assert.equal(app.run('doc.layers.length'), 1);
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 2, 2), BLUE);
});

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

test('renderComposite : empile les calques visibles avec leur opacité', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('activeLayer().opacity = 0.25');
    assert.ok(near(px(app.run('renderComposite(8, 6)'), 4, 3), [191, 64, 0, 255], 2));
    app.run('activeLayer().visible = false');
    assert.deepEqual(px(app.run('renderComposite(8, 6)'), 4, 3), RED);
});

test('renderComposite : un calque d\'opacité nulle est ignoré', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('activeLayer().opacity = 0');
    assert.deepEqual(px(app.run('renderComposite(8, 6)'), 4, 3), RED);
});

test('renderComposite : les réglages du calque ne touchent que ce calque, les réglages globaux touchent tout', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('doc.layers[0].settings.filters = ["Négatif"]');   // fond rouge → cyan
    app.run('selectLayer(doc.layers[1].id); activeLayer().canvas.getContext("2d").clearRect(0, 0, 4, 6)');
    const left = px(app.run('renderComposite(8, 6)'), 1, 3);
    const right = px(app.run('renderComposite(8, 6)'), 6, 3);
    assert.deepEqual(left, [0, 255, 255, 255], 'zone du fond : négatif du rouge');
    assert.deepEqual(right, GREEN, 'zone du calque vert : intacte');
    app.run('doc.globals.filters = ["Négatif"]');
    assert.deepEqual(px(app.run('renderComposite(8, 6)'), 6, 3), [255, 0, 255, 255], 'réglage global : négatif de tout');
    assert.deepEqual(px(app.run('renderComposite(8, 6, false)'), 6, 3), GREEN, 'sans les réglages globaux');
});

test('renderComposite à une autre taille : mise à l\'échelle', () => {
    const app = fresh();
    const c = app.run('renderComposite(16, 12)');
    assert.deepEqual([c.width, c.height], [16, 12]);
    assert.deepEqual(px(c, 15, 11), RED);
});

test('previewDims : taille inchangée sous 2048, réduite au-delà en gardant le ratio', () => {
    const app = loadApp();
    assert.deepEqual(JSON.parse(JSON.stringify(app.run('previewDims(800, 600)'))), { w: 800, h: 600 });
    assert.deepEqual(JSON.parse(JSON.stringify(app.run('previewDims(4096, 2048)'))), { w: 2048, h: 1024 });
    assert.deepEqual(JSON.parse(JSON.stringify(app.run('previewDims(1, 10000)'))), { w: 1, h: 2048 });
});

test('originalCanvas : l\'image telle qu\'ouverte, inchangée par les modifications suivantes', () => {
    const app = fresh();
    assert.deepEqual(px(app.run('originalCanvas'), 2, 2), RED);
    addSolidLayer(app, GREEN, 'Vert');
    app.run('doc.globals.filters = ["Négatif"]');
    app.run('commit()');
    assert.deepEqual(px(app.run('originalCanvas'), 2, 2), RED, 'l\'original ne bouge pas');
    app.run('clearDocument()');
    assert.equal(app.run('originalCanvas'), null);
});

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

test('annuler / rétablir : restaurent les calques et les pixels', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    assert.equal(app.run('canUndo()'), true);
    app.run('undo()');
    assert.deepEqual(names(app), ['Fond']);
    assert.equal(app.run('canRedo()'), true);
    app.run('redo()');
    assert.deepEqual(names(app), ['Fond', 'Vert']);
    assert.deepEqual(px(app.run('doc.layers[1].canvas'), 1, 1), GREEN);
});

test('annuler un tracé : le calque retrouve ses anciens pixels', () => {
    const app = fresh();
    app.run('const c = activeLayer().canvas.getContext("2d"); c.fillStyle = "#0000ff"; c.fillRect(0, 0, 8, 6); commitLayerPixels(activeLayer())');
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 1, 1), BLUE);
    app.run('undo()');
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 1, 1), RED);
    app.run('redo()');
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 1, 1), BLUE);
});

test('un nouveau changement après annuler efface la pile « rétablir »', () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('undo()');
    app.run('addLayer(null, "Autre")');
    assert.equal(app.run('canRedo()'), false);
});

test('isDirty / markSaved : modifié, enregistré, puis modifié de nouveau ; annuler jusqu\'à l\'enregistrement = propre', () => {
    const app = fresh();
    assert.equal(app.run('isDirty()'), false);
    app.run('addLayer()');
    assert.equal(app.run('isDirty()'), true);
    app.run('markSaved()');
    assert.equal(app.run('isDirty()'), false);
    app.run('addLayer()');
    assert.equal(app.run('isDirty()'), true);
    app.run('undo()');
    assert.equal(app.run('isDirty()'), false, 'revenu à l\'état enregistré');
    app.run('undo()');
    assert.equal(app.run('isDirty()'), true, 'avant l\'enregistrement');
});

test('l\'historique est limité à 30 états et reste cohérent', () => {
    const app = fresh();
    for (let i = 0; i < 40; i++) app.run('addLayer()');
    assert.equal(app.run('history.length'), 30);
    let undos = 0;
    while (app.run('canUndo()')) { app.run('undo()'); undos++; }
    assert.equal(undos, 29);
    assert.equal(app.run('doc.layers.length'), 12, '41 calques - 29 annulations');
    assert.equal(app.run('isDirty()'), true, 'l\'état enregistré est sorti de l\'historique');
});

test('clearDocument : plus de document, plus d\'historique', () => {
    const app = fresh();
    app.run('addLayer(); clearDocument()');
    assert.equal(app.run('hasDoc()'), false);
    assert.equal(app.run('canUndo()'), false);
    assert.equal(app.run('isDirty()'), false);
});

// ---------------------------------------------------------------------------
// Transformations de l'image entière
// ---------------------------------------------------------------------------

// Document 4×2 : pixel (0,0) rouge, le reste bleu.
function marked() {
    const app = loadApp();
    app.ctx.__c = solid(app, 4, 2, BLUE);
    const x = app.ctx.__c.getContext('2d');
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, 1, 1);
    app.run('setDocument({ w: 4, h: 2, name: "m", layers: [(() => { const l = makeLayer("Fond", __c); touch(l); return l; })()], saved: true })');
    return app;
}

test('flipDocument horizontal : le pixel du coin haut-gauche passe en haut à droite', () => {
    const app = marked();
    app.run('flipDocument(true)');
    const c = app.run('doc.layers[0].canvas');
    assert.deepEqual(px(c, 3, 0), RED);
    assert.deepEqual(px(c, 0, 0), BLUE);
});

test('flipDocument vertical : le pixel du coin haut-gauche passe en bas à gauche', () => {
    const app = marked();
    app.run('flipDocument(false)');
    const c = app.run('doc.layers[0].canvas');
    assert.deepEqual(px(c, 0, 1), RED);
    assert.deepEqual(px(c, 0, 0), BLUE);
});

test('flip appliqué à tous les calques', () => {
    const app = marked();
    app.run('addLayer(null, "L2")');
    app.run('const c = doc.layers[1].canvas.getContext("2d"); c.fillStyle = "#00ff00"; c.fillRect(0, 0, 1, 1); commitLayerPixels(doc.layers[1])');
    app.run('flipDocument(true)');
    assert.deepEqual(px(app.run('doc.layers[1].canvas'), 3, 0), GREEN);
    assert.deepEqual(px(app.run('doc.layers[0].canvas'), 3, 0), RED);
});

test('resizeDocument : toutes les tailles changent', () => {
    const app = marked();
    app.run('addLayer()');
    app.run('resizeDocument(8, 4)');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [8, 4]);
    for (const [w, h] of JSON.parse(JSON.stringify(app.run('doc.layers.map((l) => [l.canvas.width, l.canvas.height])')))) {
        assert.deepEqual([w, h], [8, 4]);
    }
    assert.ok(near(px(app.run('doc.layers[0].canvas'), 7, 3), BLUE, 2));
});

test('resizeDocument : dimensions invalides ignorées', () => {
    const app = marked();
    app.run('resizeDocument(0, 5); resizeDocument(5, -1)');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [4, 2]);
});

test('cropDocument : garde la zone choisie et le bon contenu', () => {
    const app = marked();
    app.run('cropDocument(0, 0, 2, 1)');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [2, 1]);
    const c = app.run('doc.layers[0].canvas');
    assert.deepEqual(px(c, 0, 0), RED);
    assert.deepEqual(px(c, 1, 0), BLUE);
    app.run('cropDocument(2, 0, 2, 2)');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [2, 2]);
});

test('rotateCanvas : 90° échange largeur et hauteur ; 0° renvoie le même canevas', () => {
    const app = marked();
    const src = app.run('doc.layers[0].canvas');
    app.ctx.__src = src;
    const r = app.run('rotateCanvas(__src, 90)');
    assert.deepEqual([r.width, r.height], [2, 4]);
    assert.equal(app.run('rotateCanvas(__src, 0)') === src, true);
    const d = app.run('rotateCanvas(__src, 45)');       // 4×2 pivoté de 45° : (4+2)·cos45 ≈ 4,24
    assert.deepEqual([d.width, d.height], [4, 4]);
});

test('bakeRotation 90° : le document change de format et le pixel suit la rotation horaire', () => {
    const app = marked();
    app.run('bakeRotation(90)');
    assert.deepEqual(Array.from(app.run('[doc.w, doc.h]')), [2, 4]);
    // Rotation horaire de 90° : le coin haut-gauche passe en haut à droite.
    assert.ok(near(px(app.run('doc.layers[0].canvas'), 1, 0), RED, 3), JSON.stringify(px(app.run('doc.layers[0].canvas'), 1, 0)));
});

// ---------------------------------------------------------------------------
// Fichier projet
// ---------------------------------------------------------------------------

test('projectData → documentFromProject : calques, pixels, réglages, opacité, visibilité, calque actif', async () => {
    const app = fresh();
    addSolidLayer(app, GREEN, 'Vert');
    app.run('activeLayer().opacity = 0.6; activeLayer().visible = false; activeLayer().settings.filters = ["Sépia"]; activeLayer().settings.brightness = 15;');
    app.run('doc.globals.contrast = 30; doc.name = "mon-projet"; selectLayer(doc.layers[0].id);');
    const json = JSON.stringify(app.run('projectData()'));
    const data = JSON.parse(json);
    assert.equal(data.format, 'pictone');
    assert.equal(data.layers.length, 2);

    const restored = app.ctx.__restored = await app.run(`documentFromProject(${json})`);
    assert.equal(restored.layers.length, 2);
    assert.equal(restored.name, 'mon-projet');
    assert.deepEqual([restored.w, restored.h], [8, 6]);
    assert.equal(restored.layers[0].name, 'Fond');
    assert.deepEqual(px(restored.layers[0].canvas, 3, 3), RED);
    assert.deepEqual(px(restored.layers[1].canvas, 3, 3), GREEN);
    assert.equal(restored.layers[1].opacity, 0.6);
    assert.equal(restored.layers[1].visible, false);
    assert.deepEqual(Array.from(restored.layers[1].settings.filters), ['Sépia']);
    assert.equal(restored.layers[1].settings.brightness, 15);
    assert.equal(restored.globals.contrast, 30);
    assert.equal(restored.activeId, restored.layers[0].id);
    assert.equal(restored.saved, true);
});

test('projet ouvert : les nouveaux calques reçoivent des identifiants jamais utilisés', async () => {
    const app = fresh();
    for (let i = 0; i < 5; i++) addSolidLayer(app, GREEN, `L${i}`);
    const json = JSON.stringify(app.run('projectData()'));
    const fresh2 = loadApp();                           // nouvelle session : compteur d'identifiants à zéro
    const restored = await fresh2.run(`documentFromProject(${json})`);
    fresh2.ctx.__r = restored;
    fresh2.run('setDocument(__r)');
    fresh2.run('addLayer(null, "Neuf")');
    const ids = Array.from(fresh2.run('doc.layers.map((l) => l.id)'));
    assert.equal(new Set(ids).size, ids.length, `identifiants en double : ${ids}`);
});

test('documentFromProject rejette un fichier qui n\'est pas un projet PicTone', async () => {
    const app = loadApp();
    for (const bad of ['null', '{}', '{"format":"autre","layers":[]}', '{"format":"pictone","layers":[]}', '{"format":"pictone","layers":"x"}']) {
        await assert.rejects(() => app.run(`documentFromProject(${bad})`), /projet PicTone valide/, bad);
    }
});

test('documentFromProject : opacité et visibilité absentes → valeurs par défaut', async () => {
    const app = fresh();
    const data = JSON.parse(JSON.stringify(app.run('projectData()')));
    delete data.layers[0].opacity;
    delete data.layers[0].visible;
    const restored = await app.run(`documentFromProject(${JSON.stringify(data)})`);
    assert.equal(restored.layers[0].opacity, 1);
    assert.equal(restored.layers[0].visible, true);
});
