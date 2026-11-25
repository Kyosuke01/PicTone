'use strict';
// Cohérence entre index.html et les scripts : un identifiant manquant casse l'application sans erreur de test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const jsFiles = fs.readdirSync(path.join(WEB, 'js')).filter((f) => f.endsWith('.js'));
const sources = Object.fromEntries(jsFiles.map((f) => [f, fs.readFileSync(path.join(WEB, 'js', f), 'utf8')]));

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test('chaque script de web/js est chargé par index.html, et chaque script chargé existe', () => {
    const loaded = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of loaded) assert.ok(fs.existsSync(path.join(WEB, src)), `script introuvable : ${src}`);
    for (const f of jsFiles) assert.ok(loaded.includes(`js/${f}`), `js/${f} n'est pas chargé par index.html`);
});

test('ordre de chargement : engine, model, view, io, shortcuts, updater, ui', () => {
    const order = [...html.matchAll(/<script src="js\/([^"]+)\.js"/g)].map((m) => m[1]);
    assert.deepEqual(order, ['engine', 'model', 'view', 'io', 'shortcuts', 'updater', 'ui']);
});

test('chaque script de web/js est une syntaxe JavaScript valide', () => {
    for (const [name, src] of Object.entries(sources)) {
        assert.doesNotThrow(() => new vm.Script(src, { filename: name }), name);
    }
});

test('chaque identifiant lu par les scripts (getElementById, $) existe dans index.html', () => {
    const missing = [];
    for (const [file, src] of Object.entries(sources)) {
        for (const m of src.matchAll(/(?:getElementById|\$)\(\s*'([^']+)'\s*\)/g)) {
            if (!htmlIds.has(m[1])) missing.push(`${file} : #${m[1]}`);
        }
    }
    assert.deepEqual(missing, []);
});

test('les identifiants d\'index.html sont uniques', () => {
    const all = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const dup = all.filter((id, i) => all.indexOf(id) !== i);
    assert.deepEqual(dup, []);
});

test('aucun identifiant « onglet Édition / Avant-Après » de l\'ancienne interface ne subsiste', () => {
    for (const [file, src] of Object.entries(sources)) {
        assert.ok(!/tab-edit|tab-split|tabEditBtn|tabSplitBtn/.test(src), `${file} utilise l'ancien onglet`);
    }
    assert.ok(htmlIds.has('btn-compare') && htmlIds.has('compare-labels'));
});

test('aucun émoji ni symbole décoratif dans l\'interface : uniquement des icônes SVG', () => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2980}-\u{2BFF}\u{FE0F}]/u;
    const files = { 'index.html': html, 'style.css': fs.readFileSync(path.join(WEB, 'style.css'), 'utf8'), ...sources };
    for (const [name, text] of Object.entries(files)) {
        const found = text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => emoji.test(l));
        assert.deepEqual(found.map(([n, l]) => `${name}:${n} ${l.trim().slice(0, 60)}`), []);
    }
});

test('fenêtre de fermeture : Annuler, Enregistrer, Quitter — plus de « Enregistrer sous »', () => {
    const choices = [...html.matchAll(/data-quit-choice="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(choices, ['cancel', 'save', 'quit']);
    assert.ok(!/Enregistrer sous/.test(html));
});

test('la fenêtre « Enregistrer » de la fermeture passe par saveProject (qui demande toujours où)', () => {
    const ui = sources['ui.js'];
    const quit = ui.slice(ui.indexOf('async function handleQuitRequest'));
    assert.match(quit, /saveProject\(\)/);
    assert.match(quit, /choice === 'cancel'/);
    assert.match(quit, /choice === 'quit'/);
});

test('le sélecteur de fichier accepte les projets .pictone', () => {
    const input = html.match(/<input type="file" id="file-input"[^>]*>/)[0];
    assert.match(input, /\.pictone/);
});

test('la liste des calques est focalisable (suppression au clavier) et le bouton Fusionner existe', () => {
    assert.match(sources['ui.js'], /row\.tabIndex = 0/);
    assert.ok(htmlIds.has('btn-layer-merge'));
});
