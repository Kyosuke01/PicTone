/* ==========================================================================
   PicTone — raccourcis clavier : fonction pure qui associe un événement clavier à une commande.

   Le modificateur est ⌘ (Cmd) sous macOS et Ctrl sous Windows. Les chiffres et la touche « / » sont
   reconnus par leur position physique (event.code) : sur un clavier AZERTY, « 0 » et « / » demandent
   Maj, et event.key donne alors « à » ou « : » selon la plateforme. Les touches + et - restent
   reconnues par leur caractère (la touche « - » n'est pas au même endroit selon le clavier).
   ========================================================================== */

// Chiffre tapé sur la rangée du haut ou le pavé numérique (indépendant de la disposition du clavier).
function digitOf(e) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    if (m) return m[1];
    return /^\d$/.test(e.key || '') ? e.key : null;
}

// « / » : touche Slash (QWERTY) ou Maj + point (AZERTY), ou le caractère lui-même.
function isSlashKey(e) {
    if (e.key === '/' || e.key === ':' || e.key === '?') return true;
    return e.code === 'Slash' || (e.shiftKey && e.code === 'Period');
}

// Renvoie l'identifiant de la commande (voir runCommand dans ui.js), ou null si l'événement n'en déclenche aucune.
// ctx : { isMac, textFocused, cropping, hasDoc, layersFocused }
function shortcutCommand(e, ctx = {}) {
    const key = (e.key || '').toLowerCase();
    const mod = ctx.isMac ? !!e.metaKey : !!e.ctrlKey;
    const other = ctx.isMac ? !!e.ctrlKey : !!e.metaKey;   // l'autre touche de commande : jamais un raccourci
    const shift = !!e.shiftKey;

    if (e.altKey || other) return null;

    if (!mod) {
        if (ctx.textFocused) return null;
        if (e.key === 'F1') return 'shortcuts';
        if (ctx.cropping) return e.key === 'Enter' ? 'cropApply' : null;
        if (ctx.layersFocused && (e.key === 'Backspace' || e.key === 'Delete')) return 'deleteLayer';
        if (ctx.hasDoc && key === '[') return 'brushSmaller';
        if (ctx.hasDoc && key === ']') return 'brushLarger';
        return null;
    }

    // Dans une zone de saisie, seuls ouvrir et enregistrer restent actifs (le reste édite le texte).
    if (ctx.textFocused) {
        if (key === 'o' && !shift) return 'open';
        if (key === 's' && !shift) return 'save';
        return null;
    }

    if (key === 'o' && !shift) return 'open';
    if (key === 's' && !shift) return 'save';
    if (key === 'e' && shift) return 'export';
    if (key === 'z' && !shift) return 'undo';
    if ((key === 'z' && shift) || (key === 'y' && !shift)) return 'redo';
    if (key === 'n' && shift) return 'newLayer';
    if (key === 'j' && !shift) return 'duplicateLayer';
    if (key === 'e' && !shift) return 'mergeLayers';
    if (key === ']' && !shift) return 'moveLayerUp';
    if (key === '[' && !shift) return 'moveLayerDown';
    if (shift && e.key === 'ArrowUp') return 'moveLayerUp';
    if (shift && e.key === 'ArrowDown') return 'moveLayerDown';
    if (e.key === 'Backspace' || e.key === 'Delete') return 'deleteLayer';
    if (key === 'a' && !shift) return ctx.layersFocused ? 'selectAllLayers' : null;
    if (key === 'c' && !shift) return 'copy';
    if (key === 'x' && !shift) return 'cut';
    if (key === 'v' && !shift) return 'paste';
    if (key === 'b' && !shift) return 'toggleSplit';
    if (key === '+' || key === '=' || e.code === 'NumpadAdd') return 'zoomIn';
    if (key === '-' || e.code === 'NumpadSubtract') return 'zoomOut';
    const digit = digitOf(e);
    if (digit === '0' && !shift) return 'zoomFit';
    if (digit === '1' && !shift) return 'zoomActual';
    if (isSlashKey(e)) return 'shortcuts';
    return null;
}

// ---------------------------------------------------------------------------
// Affichage des raccourcis, selon la plateforme.
// Forme canonique : « Ctrl+Maj+E » (Shift accepté). Le dernier élément est la touche, même si c'est « + ».
// ---------------------------------------------------------------------------

function parseShortcut(canonical) {
    const out = { ctrl: false, shift: false, alt: false, key: '' };
    let rest = canonical;
    for (;;) {
        const m = /^(Ctrl|Shift|Maj|Alt)\+(?=.)/.exec(rest);
        if (!m) break;
        if (m[1] === 'Ctrl') out.ctrl = true;
        else if (m[1] === 'Alt') out.alt = true;
        else out.shift = true;
        rest = rest.slice(m[0].length);
    }
    out.key = rest;
    return out;
}

// macOS : « ⇧⌘E » (ordre ⌥ ⇧ ⌘ puis la touche) · Windows : « Ctrl+Maj+E ».
function formatShortcut(canonical, isMac) {
    const p = parseShortcut(canonical);
    if (isMac) {
        const macKeys = { Backspace: '⌫', Delete: '⌦', ArrowUp: '↑', ArrowDown: '↓', Enter: '↩' };
        return (p.alt ? '⌥' : '') + (p.shift ? '⇧' : '') + (p.ctrl ? '⌘' : '') + (macKeys[p.key] || p.key);
    }
    const parts = [];
    if (p.ctrl) parts.push('Ctrl');
    if (p.alt) parts.push('Alt');
    if (p.shift) parts.push('Maj');
    parts.push(p.key);
    return parts.join('+');
}
