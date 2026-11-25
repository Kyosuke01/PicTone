// Pont de compatibilité : app.js appelle window.pywebview.api.* (héritage de la version Python).
// Sous Tauri, ces appels sont redirigés vers les commandes Rust. Hors Tauri (navigateur de
// développement), ce fichier ne fait rien.
(function () {
    const tauri = window.__TAURI__;
    if (!tauri || !tauri.core) return;
    const call = (cmd, args) => tauri.core.invoke(cmd, args);
    window.pywebview = {
        api: {
            get_version: () => call('get_version'),
            check_update: () => call('check_update'),
            install_update: () => call('install_update'),
            set_command_states: (states) => call('set_command_states', { states }),
            log_js: (message) => call('log_js', { message: String(message) }),
            save_file: (dataUrl, filename) => call('save_file', { dataUrl, filename }),
            pick_file: (mode) => call('pick_file', { mode }),
            read_clipboard_image: () => call('read_clipboard_image'),
            quit_app: () => call('quit_app'),
        },
    };
    // Demande de fermeture venant de Rust (bouton rouge, Cmd+Q) : l'interface décide.
    if (tauri.event && typeof tauri.event.listen === 'function') {
        tauri.event.listen('quit-request', () => window.dispatchEvent(new Event('pictone-quit-request')));
    }
    window.dispatchEvent(new Event('pywebviewready'));
})();
