'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, solid, px, near } = require('./harness');

const app = loadApp(['engine']);

// Applique un filtre (ou un réglage complet) à un canevas uni 4×4 et renvoie le pixel central.
function filtered(rgba, settings) {
    const c = solid(app, 4, 4, rgba);
    app.ctx.__c = c;
    app.ctx.__s = settings;
    app.run('applySettingsToContext(__c.getContext("2d"), __c.width, __c.height, Object.assign(defaultSettings(), __s), 1)');
    return px(c, 2, 2);
}

// Valeurs attendues calculées à la main à partir des formules de engine.js.
const CASES = [
    // [filtre, entrée, sortie attendue]
    ['Noir & Blanc', [200, 100, 50, 255], [0, 0, 0, 255]],            // luminance 124 < 128 → noir
    ['Noir & Blanc', [200, 200, 200, 255], [255, 255, 255, 255]],     // luminance 200 > 128 → blanc
    ['Sépia', [200, 100, 50, 255], [165, 147, 114, 255]],
    ['Vert', [200, 100, 50, 255], [125, 175, 0, 255]],
    ['Rouge', [200, 100, 50, 255], [255, 25, 0, 255]],
    ['Bleu', [200, 100, 50, 255], [125, 25, 125, 255]],
    ['Nuance de Gris', [200, 100, 50, 255], [117, 117, 117, 255]],    // moyenne 116,67
    ['Négatif', [200, 100, 50, 255], [55, 155, 205, 255]],
    ['Vivid', [100, 100, 100, 255], [120, 115, 85, 255]],
    ['Cinématique', [100, 100, 100, 255], [110, 95, 110, 255]],
    ['Aquarelle', [100, 100, 100, 255], [140, 140, 160, 255]],
];

for (const [filter, input, expected] of CASES) {
    test(`filtre « ${filter} » sur ${JSON.stringify(input)}`, () => {
        const out = filtered(input, { filters: [filter] });
        assert.ok(near(out, expected, 1), `obtenu ${JSON.stringify(out)}, attendu ${JSON.stringify(expected)}`);
    });
}

test('« Aucun » ne change aucun pixel', () => {
    assert.deepEqual(filtered([12, 34, 56, 255], { filters: ['Aucun'] }), [12, 34, 56, 255]);
});

test('un filtre inconnu laisse l\'image intacte', () => {
    assert.deepEqual(filtered([12, 34, 56, 255], { filters: ['Inexistant'] }), [12, 34, 56, 255]);
});

test('les filtres s\'enchaînent dans l\'ordre de la liste (important pour les filtres non commutatifs)', () => {
    const a = filtered([200, 100, 50, 255], { filters: ['Négatif', 'Nuance de Gris'] });   // (55,155,205) → 138
    const b = filtered([200, 100, 50, 255], { filters: ['Nuance de Gris', 'Négatif'] });   // 117 → 138
    // Ces deux filtres commutent : 255 - 117 = 138 et (55+155+205)/3 = 138,33.
    assert.ok(near(a, [138, 138, 138, 255], 1));
    assert.ok(near(b, [138, 138, 138, 255], 1));
    // Avec un filtre non commutatif : Vert puis Négatif ≠ Négatif puis Vert.
    const c = filtered([200, 100, 50, 255], { filters: ['Vert', 'Négatif'] });   // (125,175,0) → (130,80,255)
    const d = filtered([200, 100, 50, 255], { filters: ['Négatif', 'Vert'] });   // (55,155,205) → (0,230,130)
    assert.ok(near(c, [130, 80, 255, 255], 1), JSON.stringify(c));
    assert.ok(near(d, [0, 230, 130, 255], 1), JSON.stringify(d));
});

test('opacité du filtre « Opacité » : alpha = valeur / 255', () => {
    const out = filtered([200, 100, 50, 255], { filters: ['Opacité'], filterOpacity: 128 });
    assert.ok(Math.abs(out[3] - 128) <= 1, `alpha ${out[3]}`);
    const none = filtered([200, 100, 50, 255], { filters: ['Opacité'], filterOpacity: 0 });
    assert.equal(none[3], 0);
    const full = filtered([200, 100, 50, 255], { filters: ['Opacité'], filterOpacity: 255 });
    assert.equal(full[3], 255);
});

test('luminosité : +50 ajoute 50 à chaque canal, bornée à 255', () => {
    assert.ok(near(filtered([100, 100, 100, 255], { brightness: 50 }), [150, 150, 150, 255], 1));
    assert.ok(near(filtered([230, 100, 0, 255], { brightness: 50 }), [255, 150, 50, 255], 1));
    assert.ok(near(filtered([20, 100, 100, 255], { brightness: -50 }), [0, 50, 50, 255], 1));
});

test('contraste : +100 écarte les valeurs de 128 (facteur 2,268)', () => {
    // (140 - 128) × 2,2678 + 128 = 155,2
    assert.ok(near(filtered([140, 140, 140, 255], { contrast: 100 }), [155, 155, 155, 255], 1));
    // 128 est le point fixe du contraste
    assert.ok(near(filtered([128, 128, 128, 255], { contrast: 100 }), [128, 128, 128, 255], 1));
    // contraste négatif : rapproche de 128
    const flat = filtered([200, 200, 200, 255], { contrast: -100 });
    assert.ok(flat[0] < 200 && flat[0] > 128, `obtenu ${flat[0]}`);
});

test('saturation : -100 donne du gris, +100 double l\'écart à la moyenne', () => {
    assert.ok(near(filtered([200, 100, 50, 255], { saturation: -100 }), [117, 117, 117, 255], 1));
    // moyenne 116,67 : r = 116,67 + 83,33×2 → 255 (borné) ; g = 116,67 - 16,67×2 = 83 ; b → 0 (borné)
    assert.ok(near(filtered([200, 100, 50, 255], { saturation: 100 }), [255, 83, 0, 255], 1));
});

test('réglages à zéro : aucune modification', () => {
    assert.deepEqual(filtered([10, 20, 30, 255], { brightness: 0, contrast: 0, saturation: 0 }), [10, 20, 30, 255]);
});

test('Contours : une zone uniforme devient noire, un bord net devient clair', () => {
    const c = app.run('blankCanvas(8, 8)');
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#fff'; x.fillRect(4, 0, 4, 8);        // bord vertical entre x = 3 et x = 4
    app.ctx.__c = c;
    app.run('applyPixelFilter(__c.getContext("2d"), "Contours", 8, 8)');
    assert.deepEqual(px(c, 1, 4), [0, 0, 0, 255], 'zone uniforme noire');
    assert.deepEqual(px(c, 6, 4), [0, 0, 0, 255], 'zone uniforme blanche : pas de contour');
    const edge = px(c, 3, 4);
    assert.ok(edge[0] > 200, `le bord doit être clair, obtenu ${edge[0]}`);
});

test('Flou : adoucit un bord net sans déplacer le centre de masse', () => {
    const c = app.run('blankCanvas(20, 20)');
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 20, 20);
    x.fillStyle = '#fff'; x.fillRect(10, 0, 10, 20);
    app.ctx.__c = c;
    app.run('applySettingsToContext(__c.getContext("2d"), 20, 20, Object.assign(defaultSettings(), { filters: ["Flou"], blur: 3 }), 1)');
    const edge = px(c, 10, 10)[0];
    assert.ok(edge > 20 && edge < 235, `le bord doit être adouci, obtenu ${edge}`);
    assert.ok(px(c, 0, 10)[0] < 5, 'loin du bord, le noir reste noir');
    assert.ok(px(c, 19, 10)[0] > 250, 'loin du bord, le blanc reste blanc');
    // Le flou conserve la luminosité moyenne.
    const data = c.getContext('2d').getImageData(0, 0, 20, 20).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    const mean = sum / 400;
    assert.ok(Math.abs(mean - 127.5) < 3, `moyenne ${mean}`);
});

test('Flou : le rayon est proportionnel à l\'échelle de l\'aperçu', () => {
    const make = () => {
        const c = app.run('blankCanvas(20, 20)');
        const x = c.getContext('2d');
        x.fillStyle = '#000'; x.fillRect(0, 0, 20, 20);
        x.fillStyle = '#fff'; x.fillRect(10, 0, 10, 20);
        return c;
    };
    const strong = make(), weak = make();
    app.ctx.__strong = strong; app.ctx.__weak = weak;
    app.run('applySettingsToContext(__strong.getContext("2d"), 20, 20, Object.assign(defaultSettings(), { filters: ["Flou"], blur: 4 }), 1)');
    app.run('applySettingsToContext(__weak.getContext("2d"), 20, 20, Object.assign(defaultSettings(), { filters: ["Flou"], blur: 4 }), 0.25)');
    const spread = (c) => { let n = 0; for (let x = 0; x < 20; x++) { const v = px(c, x, 10)[0]; if (v > 10 && v < 245) n++; } return n; };
    assert.ok(spread(strong) > spread(weak), `échelle 1 : ${spread(strong)} pixels de transition, échelle 0,25 : ${spread(weak)}`);
});

test('boxesForGauss : n tailles de boîte impaires', () => {
    const sizes = app.run('boxesForGauss(5, 3)');
    assert.equal(sizes.length, 3);
    for (const s of sizes) assert.equal(s % 2, 1, `taille ${s} paire`);
});

test('isNeutralSettings : vrai seulement sans aucun effet', () => {
    assert.equal(app.run('isNeutralSettings(defaultSettings())'), true);
    assert.equal(app.run('isNeutralSettings(Object.assign(defaultSettings(), { filters: ["Sépia"] }))'), false);
    assert.equal(app.run('isNeutralSettings(Object.assign(defaultSettings(), { brightness: 1 }))'), false);
    assert.equal(app.run('isNeutralSettings(Object.assign(defaultSettings(), { contrast: -1 }))'), false);
    assert.equal(app.run('isNeutralSettings(Object.assign(defaultSettings(), { saturation: 5 }))'), false);
    assert.equal(app.run('isNeutralSettings(Object.assign(defaultSettings(), { filters: ["Aucun", "Aucun"] }))'), true);
});

test('cloneSettings : copie indépendante, y compris la liste des filtres', () => {
    const r = app.run(`(() => {
        const a = defaultSettings();
        const b = cloneSettings(a);
        b.filters.push('Sépia'); b.blur = 40;
        return { filtersA: a.filters, blurA: a.blur, filtersB: b.filters };
    })()`);
    assert.deepEqual(Array.from(r.filtersA), ['Aucun']);
    assert.equal(r.blurA, 5);
    assert.deepEqual(Array.from(r.filtersB), ['Aucun', 'Sépia']);
});

test('blankCanvas : arrondit et impose au moins 1 × 1', () => {
    const c = app.run('blankCanvas(0, -3)');
    assert.deepEqual([c.width, c.height], [1, 1]);
    const d = app.run('blankCanvas(10.6, 4.4)');
    assert.deepEqual([d.width, d.height], [11, 4]);
});

test('cloneCanvas : mêmes pixels, mais indépendant de l\'original', () => {
    const src = solid(app, 3, 3, [10, 20, 30, 255]);
    app.ctx.__src = src;
    const copy = app.run('cloneCanvas(__src)');
    assert.deepEqual(px(copy, 1, 1), [10, 20, 30, 255]);
    const x = src.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 3, 3);
    assert.deepEqual(px(copy, 1, 1), [10, 20, 30, 255], 'la copie ne suit pas l\'original');
});

test('flou gaussien : un bord transparent ne « bave » pas de couleur (canaux prémultipliés)', () => {
    const c = app.run('blankCanvas(20, 4)');
    const x = c.getContext('2d');
    x.fillStyle = '#ff0000'; x.fillRect(10, 0, 10, 4);   // moitié gauche transparente, moitié droite rouge
    app.ctx.__c = c;
    app.run('gaussianBlurCanvas(__c.getContext("2d"), 20, 4, 2)');
    const edge = px(c, 10, 2);
    assert.ok(edge[3] > 40 && edge[3] < 215, `alpha adouci, obtenu ${edge[3]}`);
    assert.ok(edge[0] > 240 && edge[1] < 15 && edge[2] < 15, `la couleur reste rouge pur, obtenu ${JSON.stringify(edge)}`);
});

test('flou gaussien : un rayon nul ou négatif ne change rien', () => {
    const c = solid(app, 4, 4, [10, 20, 30, 255]);
    app.ctx.__c = c;
    app.run('gaussianBlurCanvas(__c.getContext("2d"), 4, 4, 0)');
    app.run('gaussianBlurCanvas(__c.getContext("2d"), 4, 4, -2)');
    assert.deepEqual(px(c, 1, 1), [10, 20, 30, 255]);
});
