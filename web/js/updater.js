/* ==========================================================================
   PicTone — mise à jour automatique (GitHub Releases), reprise à l'identique de la 1.0.3.
   ========================================================================== */

// Mise à jour automatique
// ---------------------------------------------------------------------------

// L'API pywebview n'est utilisable qu'une fois ses méthodes exposées (sous Windows, WebView2
// peut présenter « window.pywebview.api » avant elles).
function updaterApi() {
    const api = window.pywebview && window.pywebview.api;
    return api && typeof api.check_update === 'function' ? api : null;
}

// Traces de la mise à jour : console, puis update.log côté Python (si l'API est disponible).
function updLog(message) {
    const text = `${new Date().toISOString()} ${message}`;
    console.log('[maj]', text);
    try {
        const api = updaterApi();
        if (api && typeof api.log_js === 'function') {
            Promise.resolve(api.log_js(text)).catch(() => {});
        }
    } catch (e) {
        // journalisation facultative : jamais bloquante
    }
}

// ---------------------------------------------------------------------------
// Bouton de mise à jour : un seul état, mis à jour par le démarrage, la vérification
// périodique, le retour sur l'application et le menu « Vérifier les mises à jour ».
// ---------------------------------------------------------------------------

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // vérification toutes les 30 min
const UPDATE_FOCUS_MIN_GAP_MS = 5 * 60 * 1000;   // retour sur l'app : au plus toutes les 5 min
let updateState = { status: 'none', version: '' }; // none | ok | available
let updateBusy = false;   // téléchargement ou redémarrage en cours
let updateClickBound = false;
let lastUpdateCheck = 0;

function setUpdateButton(state, text, title) {
    const button = document.getElementById('update-status');
    const label = button && button.querySelector('.update-label');
    if (!button || !label) return;
    button.className = `update-status is-${state}`;
    button.disabled = state === 'ok' || state === 'busy';
    label.textContent = text;
    button.title = title;
    button.hidden = false;
}

function applyUpdateInfo(info) {
    if (updateBusy) return; // pendant un téléchargement, le bouton reste tel quel
    if (info && info.available) {
        updateState = { status: 'available', version: info.version };
        setUpdateButton('available', 'Mettre à jour', `Version ${info.version} disponible : cliquer pour mettre à jour`);
    } else if (info && info.up_to_date) {
        updateState = { status: 'ok', version: info.version };
        setUpdateButton('ok', 'À jour', `PicTone ${info.version} est à jour`);
    } else {
        updateState = { status: 'none', version: '' };
    }
    updLog(`état de la mise à jour : ${updateState.status} ${updateState.version}`);
}

// Demande à Python (GitHub) s'il y a une mise à jour. Renvoie l'info, ou null si le contrôle échoue.
async function checkForUpdates() {
    const api = updaterApi();
    if (!api) return null;
    lastUpdateCheck = Date.now();
    let info = null;
    for (let attempt = 1; attempt <= 3 && !info; attempt++) {
        try {
            info = await api.check_update();
            updLog(`contrôle (essai ${attempt}) : ${JSON.stringify(info)}`);
        } catch (e) {
            updLog(`contrôle (essai ${attempt}) : erreur : ${e && e.message ? e.message : e}`);
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    }
    if (info) applyUpdateInfo(info);
    return info;
}

// Menu « Vérifier les mises à jour » : même contrôle, avec le résultat affiché.
async function checkUpdatesWithReport() {
    const info = await checkForUpdates();
    let text;
    if (!info) text = 'Impossible de vérifier les mises à jour (hors ligne ou mode développement).';
    else if (info.available) text = `Mise à jour disponible : ${info.version}.\nUtilisez le bouton « Mettre à jour ».`;
    else if (info.up_to_date) text = `PicTone ${info.version} est à jour.`;
    else text = 'Mise à jour non applicable sur cette plateforme.';
    showAlert('Mises à jour', text);
}

async function installUpdate() {
    const api = updaterApi();
    if (!api || updateBusy || updateState.status !== 'available') {
        updLog(`clic ignoré : API=${!!api}, occupé=${updateBusy}, état=${updateState.status}`);
        return;
    }
    updateBusy = true;
    setUpdateButton('busy', 'Téléchargement…', 'Téléchargement de la mise à jour');
    try {
        updLog('appel de install_update()');
        const result = await api.install_update();
        updLog(`réponse de install_update() : ${JSON.stringify(result)}`);
        if (!result.ok) throw new Error(result.error);
        if (result.manual) {
            updateBusy = false;
            setUpdateButton('available', 'Mettre à jour', 'Téléchargement ouvert dans le navigateur');
            return;
        }
        setUpdateButton('busy', 'Redémarrage…', 'PicTone va redémarrer');
    } catch (e) {
        const message = e && e.message ? e.message : String(e);
        updLog(`ÉCHEC de la mise à jour : ${message}`);
        updateBusy = false;
        setUpdateButton('available', 'Réessayer', `Échec : ${message}`);
        showAlert('Mise à jour impossible', message);
    }
}

async function initUpdater() {
    const button = document.getElementById('update-status');
    if (!button || !updaterApi()) {
        updLog('initialisation annulée : bouton ou API absent');
        return;
    }
    updLog(`initialisation : API prête (user agent : ${navigator.userAgent})`);
    if (!updateClickBound) {
        updateClickBound = true;
        button.addEventListener('click', installUpdate);
    }
    await checkForUpdates();
    // Détection automatique : pas de webhook possible pour une app de bureau, on interroge GitHub périodiquement.
    setInterval(() => { if (!updateBusy) checkForUpdates(); }, UPDATE_CHECK_INTERVAL_MS);
    window.addEventListener('focus', () => {
        if (!updateBusy && Date.now() - lastUpdateCheck > UPDATE_FOCUS_MIN_GAP_MS) checkForUpdates();
    });
}

// L'événement « pywebviewready » peut être émis avant le chargement de ce script (defer) :
// on lance donc le contrôle dès que l'API est disponible, par l'événement ou par une vérification répétée.
let updaterStarted = false;
function startUpdaterOnce() {
    if (updaterStarted || !updaterApi()) return;
    updaterStarted = true;
    initUpdater();
    updateControlStates(); // l'API est prête : on envoie l'état initial aux menus natifs
}
window.addEventListener('pywebviewready', startUpdaterOnce);
let updaterAttempts = 0;
const updaterTimer = setInterval(() => {
    startUpdaterOnce();
    updaterAttempts += 1;
    if (updaterStarted || updaterAttempts > 150) clearInterval(updaterTimer); // 30 s maximum
}, 200);
