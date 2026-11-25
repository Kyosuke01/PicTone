'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness');

const app = loadApp(['shortcuts']);

// Événement clavier simplifié ; « mod » = ⌘ sur Mac, Ctrl sous Windows.
function ev(isMac, { key, code = '', mod = true, shift = false, alt = false }) {
    return { key, code, shiftKey: shift, altKey: alt, metaKey: isMac ? mod : false, ctrlKey: isMac ? false : mod };
}
function cmd(isMac, e, ctx = {}) {
    app.ctx.__e = ev(isMac, e);
    app.ctx.__c = { isMac, hasDoc: true, ...ctx };
    return app.run('shortcutCommand(__e, __c)');
}

// ---------------------------------------------------------------------------
// Raccourcis de base, sur les deux plateformes
// ---------------------------------------------------------------------------

const BASIC = [
    [{ key: 'o', code: 'KeyO' }, 'open'],
    [{ key: 's', code: 'KeyS' }, 'save'],
    [{ key: 'E', code: 'KeyE', shift: true }, 'export'],
    [{ key: 'z', code: 'KeyZ' }, 'undo'],
    [{ key: 'Z', code: 'KeyZ', shift: true }, 'redo'],
    [{ key: 'y', code: 'KeyY' }, 'redo'],
    [{ key: 'c', code: 'KeyC' }, 'copy'],
    [{ key: 'x', code: 'KeyX' }, 'cut'],
    [{ key: 'v', code: 'KeyV' }, 'paste'],
    [{ key: 'N', code: 'KeyN', shift: true }, 'newLayer'],
    [{ key: 'j', code: 'KeyJ' }, 'duplicateLayer'],
    [{ key: 'e', code: 'KeyE' }, 'mergeLayers'],
    [{ key: ']', code: 'BracketRight' }, 'moveLayerUp'],
    [{ key: '[', code: 'BracketLeft' }, 'moveLayerDown'],
    [{ key: 'ArrowUp', code: 'ArrowUp', shift: true }, 'moveLayerUp'],
    [{ key: 'ArrowDown', code: 'ArrowDown', shift: true }, 'moveLayerDown'],
    [{ key: 'Backspace', code: 'Backspace' }, 'deleteLayer'],
    [{ key: 'Delete', code: 'Delete' }, 'deleteLayer'],
    [{ key: 'b', code: 'KeyB' }, 'toggleSplit'],
    [{ key: '+', code: 'Equal', shift: true }, 'zoomIn'],
    [{ key: '=', code: 'Equal' }, 'zoomIn'],
    [{ key: '-', code: 'Minus' }, 'zoomOut'],
    [{ key: '0', code: 'Digit0' }, 'zoomFit'],
    [{ key: '1', code: 'Digit1' }, 'zoomActual'],
    [{ key: '0', code: 'Numpad0' }, 'zoomFit'],
    [{ key: '/', code: 'Slash', shift: true }, 'shortcuts'],
];

for (const isMac of [true, false]) {
    const plat = isMac ? 'macOS (⌘)' : 'Windows (Ctrl)';
    for (const [e, expected] of BASIC) {
        test(`${plat} : ${JSON.stringify(e)} → ${expected}`, () => {
            assert.equal(cmd(isMac, e), expected);
        });
    }
}

// ---------------------------------------------------------------------------
// Claviers AZERTY (cas signalés : ⌘0, ⌘1 et ⌘⇧/ ne fonctionnaient pas)
// ---------------------------------------------------------------------------

test('AZERTY macOS : ⌘0 et ⌘1 (touches « à » et « & », sans Maj) ajustent et passent en taille réelle', () => {
    assert.equal(cmd(true, { key: 'à', code: 'Digit0' }), 'zoomFit');
    assert.equal(cmd(true, { key: '&', code: 'Digit1' }), 'zoomActual');
});

test('AZERTY Windows : Ctrl+0 et Ctrl+1 de même', () => {
    assert.equal(cmd(false, { key: 'à', code: 'Digit0' }), 'zoomFit');
    assert.equal(cmd(false, { key: '&', code: 'Digit1' }), 'zoomActual');
});

test('AZERTY : ⇧⌘/ (le « / » se tape avec Maj sur la touche « : ») ouvre les raccourcis, quel que soit le caractère rapporté', () => {
    assert.equal(cmd(true, { key: '/', code: 'Period', shift: true }), 'shortcuts');
    assert.equal(cmd(true, { key: ':', code: 'Period', shift: true }), 'shortcuts');
    assert.equal(cmd(true, { key: '.', code: 'Period', shift: true }), 'shortcuts');
    assert.equal(cmd(false, { key: '/', code: 'Period', shift: true }), 'shortcuts');
    assert.equal(cmd(true, { key: '?', code: 'Slash', shift: true }), 'shortcuts');
});

test('⌘Maj+0 ne déclenche pas « ajuster » (seul ⌘0 le fait)', () => {
    assert.equal(cmd(true, { key: '0', code: 'Digit0', shift: true }), null);
});

test('F1 ouvre les raccourcis, sans modificateur', () => {
    assert.equal(cmd(false, { key: 'F1', code: 'F1', mod: false }), 'shortcuts');
});

// ---------------------------------------------------------------------------
// Plateforme : la mauvaise touche de commande ne déclenche rien
// ---------------------------------------------------------------------------

test('macOS : Ctrl+S ne déclenche rien ; Windows : la touche Windows (Meta)+S non plus', () => {
    app.ctx.__e = { key: 's', code: 'KeyS', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    app.ctx.__c = { isMac: true };
    assert.equal(app.run('shortcutCommand(__e, __c)'), null);
    app.ctx.__e = { key: 's', code: 'KeyS', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false };
    app.ctx.__c = { isMac: false };
    assert.equal(app.run('shortcutCommand(__e, __c)'), null);
});

test('Alt enfoncé : aucun raccourci (saisie de caractères spéciaux)', () => {
    assert.equal(cmd(true, { key: 's', code: 'KeyS', alt: true }), null);
    assert.equal(cmd(false, { key: 'z', code: 'KeyZ', alt: true }), null);
});

test('sans modificateur, les lettres ne déclenchent rien', () => {
    for (const k of ['o', 's', 'z', 'e', 'b', 'v']) assert.equal(cmd(true, { key: k, mod: false }), null, k);
});

// ---------------------------------------------------------------------------
// Contexte : zone de saisie, recadrage, calques, pinceau
// ---------------------------------------------------------------------------

test('dans une zone de saisie : seuls ouvrir et enregistrer restent actifs (copier, coller, supprimer éditent le texte)', () => {
    const ctx = { textFocused: true };
    assert.equal(cmd(true, { key: 'o', code: 'KeyO' }, ctx), 'open');
    assert.equal(cmd(true, { key: 's', code: 'KeyS' }, ctx), 'save');
    for (const k of [{ key: 'c' }, { key: 'v' }, { key: 'x' }, { key: 'z' }, { key: 'a' }, { key: 'Backspace' }, { key: 'b' }]) {
        assert.equal(cmd(true, k, ctx), null, JSON.stringify(k));
    }
    assert.equal(cmd(true, { key: '[', mod: false }, ctx), null);
});

test('Backspace / Suppr sans modificateur : suppriment un calque seulement si la liste des calques a le focus', () => {
    assert.equal(cmd(true, { key: 'Backspace', mod: false }, { layersFocused: true }), 'deleteLayer');
    assert.equal(cmd(false, { key: 'Delete', mod: false }, { layersFocused: true }), 'deleteLayer');
    assert.equal(cmd(true, { key: 'Backspace', mod: false }, { layersFocused: false }), null);
});

test('⌘A sélectionne tous les calques seulement si la liste des calques a le focus', () => {
    assert.equal(cmd(true, { key: 'a', code: 'KeyA' }, { layersFocused: true }), 'selectAllLayers');
    assert.equal(cmd(true, { key: 'a', code: 'KeyA' }, { layersFocused: false }), null);
});

test('recadrage en cours : Entrée valide, le reste est ignoré', () => {
    assert.equal(cmd(true, { key: 'Enter', mod: false }, { cropping: true }), 'cropApply');
    assert.equal(cmd(true, { key: 'x', mod: false }, { cropping: true }), null);
    assert.equal(cmd(true, { key: 'Enter', mod: false }, { cropping: false }), null);
});

test('[ et ] règlent la taille du pinceau seulement avec un document, sans modificateur, hors recadrage', () => {
    assert.equal(cmd(true, { key: '[', mod: false }), 'brushSmaller');
    assert.equal(cmd(true, { key: ']', mod: false }), 'brushLarger');
    assert.equal(cmd(true, { key: '[', mod: false }, { hasDoc: false }), null);
    assert.equal(cmd(true, { key: ']', mod: false }, { cropping: true }), null);
});

// ---------------------------------------------------------------------------
// Affichage des raccourcis
// ---------------------------------------------------------------------------

test('formatShortcut macOS : ordre ⌥ ⇧ ⌘ puis la touche', () => {
    const f = (s) => app.run(`formatShortcut(${JSON.stringify(s)}, true)`);
    assert.equal(f('Ctrl+O'), '⌘O');
    assert.equal(f('Ctrl+Shift+E'), '⇧⌘E');
    assert.equal(f('Ctrl+Maj+N'), '⇧⌘N');
    assert.equal(f('Ctrl+Alt+Shift+K'), '⌥⇧⌘K');
    assert.equal(f('Ctrl+Backspace'), '⌘⌫');
    assert.equal(f('Ctrl++'), '⌘+');
    assert.equal(f('Ctrl+-'), '⌘-');
    assert.equal(f('Ctrl+Shift+/'), '⇧⌘/');
});

test('formatShortcut Windows : Ctrl+Maj+touche', () => {
    const f = (s) => app.run(`formatShortcut(${JSON.stringify(s)}, false)`);
    assert.equal(f('Ctrl+O'), 'Ctrl+O');
    assert.equal(f('Ctrl+Shift+E'), 'Ctrl+Maj+E');
    assert.equal(f('Ctrl+Maj+N'), 'Ctrl+Maj+N');
    assert.equal(f('Ctrl++'), 'Ctrl++');
    assert.equal(f('Ctrl+Backspace'), 'Ctrl+Backspace');
});

// ---------------------------------------------------------------------------
// Chaque raccourci annoncé par un menu natif (menus.rs) déclenche vraiment sa commande
// ---------------------------------------------------------------------------

const MENUS = fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'src', 'menus.rs'), 'utf8');
const MENU_SHORTCUTS = [...MENUS.matchAll(/cmd\("(\w+)",\s*"[^"]*",\s*Some\("([^"]+)"\)\)/g)].map((m) => ({ id: m[1], keys: m[2] }));

test('menus.rs : au moins 15 raccourcis lus (garde-fou contre une regex cassée)', () => {
    assert.ok(MENU_SHORTCUTS.length >= 15, `${MENU_SHORTCUTS.length} raccourcis trouvés`);
});

// Événement physique correspondant à une forme canonique (« Ctrl+Shift+/ »).
function eventFor(canonical) {
    const m = /^((?:(?:Ctrl|Shift|Alt)\+)*)(.+)$/.exec(canonical);
    const mods = m[1];
    const k = m[2];
    const e = { shift: mods.includes('Shift'), alt: mods.includes('Alt') };
    if (/^\d$/.test(k)) return { ...e, key: k, code: `Digit${k}` };
    if (k === '/') return { ...e, key: '/', code: 'Slash' };
    if (k.length === 1) return { ...e, key: e.shift ? k.toUpperCase() : k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '' };
    return { ...e, key: k, code: k };
}

for (const isMac of [true, false]) {
    for (const { id, keys } of MENU_SHORTCUTS) {
        test(`menu « ${id} » (${keys}) fonctionne au clavier, ${isMac ? 'macOS' : 'Windows'}`, () => {
            // Ctrl+A : « Tout sélectionner » sélectionne les calques quand leur liste a le focus.
            const expected = id === 'selectAll' ? 'selectAllLayers' : id;
            assert.equal(cmd(isMac, eventFor(keys), { layersFocused: true }), expected);
        });
    }
}
