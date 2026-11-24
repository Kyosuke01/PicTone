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
        },
    };
    window.dispatchEvent(new Event('pywebviewready'));
})();
