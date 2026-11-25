// Banc d'essai : charge les scripts de web/js dans un contexte Node avec un vrai moteur de canevas
// (@napi-rs/canvas). Les pixels sont donc réellement calculés, comme dans l'application.
'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, Image, ImageData, loadImage } = require('@napi-rs/canvas');

const WEB = path.join(__dirname, '..', 'web');

// FileReader minimal (absent de Node) : suffit aux fonctions readAsDataURL / readAsText de io.js.
class FakeFileReader {
    readAsDataURL(blob) { this._read(blob, (buf) => `data:${blob.type || 'application/octet-stream'};base64,${buf.toString('base64')}`); }
    readAsText(blob) { this._read(blob, (buf) => buf.toString('utf8')); }
    _read(blob, convert) {
        blob.arrayBuffer().then((ab) => {
            this.result = convert(Buffer.from(ab));
            if (this.onload) this.onload();
        }, (err) => { this.error = err; if (this.onerror) this.onerror(); });
    }
}

/**
 * Charge l'application (sans interface) dans un contexte neuf.
 * @param {string[]} files scripts à charger, dans l'ordre
 * @returns {{ run: (code: string) => any, ctx: object, api: object, alerts: string[] }}
 */
function loadApp(files = ['engine', 'model', 'shortcuts', 'io']) {
    const saved = [];      // appels à save_file : { dataUrl, filename }
    const alerts = [];     // messages de showAlert
    const state = { confirm: true };   // réponse aux boîtes de confirmation
    const api = {
        save_file: async (dataUrl, filename) => { saved.push({ dataUrl, filename }); return true; },
    };
    const window = { pywebview: { api } };
    const sandbox = {
        document: { createElement: (tag) => { if (tag !== 'canvas') throw new Error(`createElement(${tag})`); return createCanvas(1, 1); } },
        window, Image, ImageData, console, atob, btoa, Blob, File, Uint8Array, Uint8ClampedArray, Float32Array,
        rotation: 0, FileReader: FakeFileReader, navigator: { platform: 'Test' }, setTimeout, clearTimeout,
        // Dialogues de l'interface (ui.js) : on enregistre les messages et on confirme.
        showAlert: async (title, msg) => { alerts.push(`${title}: ${msg}`); },
        showConfirm: async () => state.confirm,
        updLog: () => {},
    };
    const ctx = vm.createContext(sandbox);
    for (const name of files) {
        const file = path.join(WEB, 'js', `${name}.js`);
        vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    }
    return { run: (code) => vm.runInContext(code, ctx), ctx, api, alerts, saved, state };
}

// Canevas uni de la couleur donnée, créé par l'application.
function solid(app, w, h, rgba) {
    const c = app.run(`blankCanvas(${w}, ${h})`);
    const x = c.getContext('2d');
    x.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${(rgba[3] ?? 255) / 255})`;
    x.fillRect(0, 0, c.width, c.height);
    return c;
}

// Pixel [r, g, b, a] d'un canevas.
function px(canvas, x, y) {
    return Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

// Compare deux pixels avec une tolérance (arrondis du moteur de canevas).
function near(actual, expected, tol = 2) {
    return actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]) <= tol);
}

// Ouvre un document d'un seul calque uni (w × h) dans l'application.
function openSolid(app, w, h, rgba, name = 'test') {
    app.ctx.__c = solid(app, w, h, rgba);
    app.run(`setDocument({ w: ${w}, h: ${h}, name: ${JSON.stringify(name)}, layers: [(() => { const l = makeLayer('Fond', __c); touch(l); return l; })()], saved: true })`);
}

// Ajoute un calque uni au document ouvert.
function addSolidLayer(app, rgba, name) {
    app.ctx.__c = solid(app, app.run('doc.w'), app.run('doc.h'), rgba);
    return app.run(`addLayer(__c, ${JSON.stringify(name)}).id`);
}

module.exports = { loadApp, solid, px, near, openSolid, addSolidLayer, loadImage, createCanvas };
