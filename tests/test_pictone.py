"""Tests de pictone.py : chemins, journaux, WebView2, API JavaScript et point d'entrée."""

import base64
import os
import re
import subprocess
import sys
import tempfile
import types

import pytest

import pictone
import updater
from conftest import FakeWindow

_KNOWN_KEYS = {
    ("HKLM", r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
    ("HKLM", r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
    ("HKCU", r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
}


# ---------------------------------------------------------------------------
# resource_path / load_version
# ---------------------------------------------------------------------------

def test_resource_path_uses_meipass_when_frozen(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert pictone.resource_path("web", "index.html") == os.path.join(str(tmp_path), "web", "index.html")


def test_resource_path_uses_source_dir_in_dev(monkeypatch):
    monkeypatch.delattr(sys, "_MEIPASS", raising=False)
    source_dir = os.path.dirname(os.path.abspath(pictone.__file__))
    assert pictone.resource_path("web") == os.path.join(source_dir, "web")


def test_load_version_reads_and_strips(monkeypatch, tmp_path):
    (tmp_path / "version.txt").write_text("  3.2.0\n", encoding="utf-8")
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert pictone.load_version() == "3.2.0"


def test_load_version_empty_file_is_unknown(monkeypatch, tmp_path):
    (tmp_path / "version.txt").write_text("  \n", encoding="utf-8")
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert pictone.load_version() == "unknown"


def test_load_version_missing_file_is_unknown(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert pictone.load_version() == "unknown"


# ---------------------------------------------------------------------------
# _log_candidates / log_error
# ---------------------------------------------------------------------------

def test_log_candidates_windows_prefers_localappdata(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    monkeypatch.setattr(pictone, "IS_MAC", False)
    monkeypatch.setenv("LOCALAPPDATA", "C:\\Users\\alice\\AppData\\Local")
    first = next(pictone._log_candidates())
    assert first == os.path.join("C:\\Users\\alice\\AppData\\Local", "PicTone", "logs")


def test_log_candidates_windows_without_localappdata_skips_it(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    monkeypatch.setattr(pictone, "IS_MAC", False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    assert list(pictone._log_candidates()) == [os.path.join(tempfile.gettempdir(), "PicTone")]


def test_log_candidates_macos_uses_library_logs(monkeypatch, tmp_path):
    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    monkeypatch.setattr(pictone, "IS_MAC", True)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    first = next(pictone._log_candidates())
    assert first == os.path.join(str(tmp_path), "Library", "Logs", "PicTone")


def test_log_candidates_always_end_with_temp_dir(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    monkeypatch.setattr(pictone, "IS_MAC", False)
    assert list(pictone._log_candidates()) == [os.path.join(tempfile.gettempdir(), "PicTone")]


def test_log_error_writes_message_and_version(monkeypatch, log_dir):
    monkeypatch.setattr(pictone, "CURRENT_VERSION", "9.9.9")
    path = pictone.log_error("boom")
    assert path == os.path.join(str(log_dir), "crash_log.txt")
    content = open(path, encoding="utf-8").read()
    assert "v9.9.9" in content
    assert "boom" in content
    assert re.fullmatch(r"\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] v9\.9\.9\nboom\n", content)


def test_log_error_appends_to_existing_file(log_dir):
    pictone.log_error("first")
    path = pictone.log_error("second")
    content = open(path, encoding="utf-8").read()
    assert "first" in content and "second" in content
    assert content.index("first") < content.index("second")


def test_log_error_falls_back_to_next_candidate(monkeypatch, tmp_path):
    blocker = tmp_path / "blocker"
    blocker.write_text("un fichier, pas un dossier")  # impossible d'y créer un sous-dossier
    good = tmp_path / "good"
    monkeypatch.setattr(pictone, "_log_candidates", lambda: iter([str(blocker / "logs"), str(good)]))
    path = pictone.log_error("msg")
    assert path == os.path.join(str(good), "crash_log.txt")
    assert "msg" in open(path, encoding="utf-8").read()


def test_log_error_returns_none_when_no_candidate_works(monkeypatch, tmp_path):
    blocker = tmp_path / "blocker"
    blocker.write_text("x")
    monkeypatch.setattr(pictone, "_log_candidates", lambda: iter([str(blocker / "logs")]))
    assert pictone.log_error("msg") is None


# ---------------------------------------------------------------------------
# _applescript_string / show_error / report_crash
# ---------------------------------------------------------------------------

def test_applescript_string_escapes_quotes_and_backslashes():
    assert pictone._applescript_string('a "b" \\c') == '"a \\"b\\" \\\\c"'


def test_applescript_string_turns_newlines_into_return():
    assert pictone._applescript_string("ligne 1\nligne 2") == '"ligne 1" & return & "ligne 2"'


def test_show_error_macos_uses_osascript(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    monkeypatch.setattr(pictone, "IS_MAC", True)
    calls = []
    monkeypatch.setattr(pictone.subprocess, "run", lambda args, **kwargs: calls.append((args, kwargs)))
    pictone.show_error('Erreur "grave"\nligne 2')
    args, kwargs = calls[0]
    assert kwargs == {"check": False, "timeout": 120}
    assert args[0] == "osascript" and args[1] == "-e"
    assert 'display dialog "Erreur \\"grave\\"" & return & "ligne 2"' in args[2]
    assert "with icon stop" in args[2]
    assert 'with title "PicTone"' in args[2]


def test_show_error_macos_falls_back_to_stderr_when_dialog_fails(monkeypatch, capsys):
    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    monkeypatch.setattr(pictone, "IS_MAC", True)

    def broken(*args, **kwargs):
        raise OSError("osascript absent")

    monkeypatch.setattr(pictone.subprocess, "run", broken)
    pictone.show_error("message de secours")
    assert "message de secours" in capsys.readouterr().err


def test_show_error_windows_uses_message_box(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    monkeypatch.setattr(pictone, "IS_MAC", False)
    shown = []
    fake_ctypes = types.SimpleNamespace(
        windll=types.SimpleNamespace(
            user32=types.SimpleNamespace(MessageBoxW=lambda *args: shown.append(args))
        )
    )
    monkeypatch.setitem(sys.modules, "ctypes", fake_ctypes)
    pictone.show_error("Problème")
    assert len(shown) == 1
    assert shown[0][0] == 0  # pas de fenêtre parente
    assert shown[0][1] == "Problème"
    assert shown[0][2] == "PicTone"
    assert shown[0][3] == 0x10  # MB_ICONERROR


def test_show_error_linux_prints_to_stderr(monkeypatch, capsys):
    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    monkeypatch.setattr(pictone, "IS_MAC", False)
    pictone.show_error("hello")
    assert "hello" in capsys.readouterr().err


def test_report_crash_mentions_log_path(monkeypatch):
    monkeypatch.setattr(pictone, "log_error", lambda text: "/logs/crash_log.txt")
    shown = []
    monkeypatch.setattr(pictone, "show_error", lambda message: shown.append(message))
    pictone.report_crash("trace")
    assert shown[0] == "PicTone a rencontré une erreur et doit se fermer.\n\nDétails : /logs/crash_log.txt"


def test_report_crash_without_log_path_omits_details(monkeypatch):
    monkeypatch.setattr(pictone, "log_error", lambda text: None)
    shown = []
    monkeypatch.setattr(pictone, "show_error", lambda message: shown.append(message))
    pictone.report_crash("trace")
    assert "Détails" not in shown[0]
    assert "doit se fermer" in shown[0]


def test_report_crash_logs_the_traceback(monkeypatch):
    logged = []
    monkeypatch.setattr(pictone, "log_error", lambda text: logged.append(text) or "x")
    monkeypatch.setattr(pictone, "show_error", lambda message: None)
    pictone.report_crash("Traceback: exemple")
    assert logged == ["Traceback: exemple"]


# ---------------------------------------------------------------------------
# is_webview2_installed
# ---------------------------------------------------------------------------

class _Handle:
    def __init__(self, pv):
        self.pv = pv

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _fake_winreg(monkeypatch, pv_by_hive, opened_keys):
    module = types.ModuleType("winreg")
    module.HKEY_LOCAL_MACHINE = "HKLM"
    module.HKEY_CURRENT_USER = "HKCU"

    def open_key(hive, key):
        opened_keys.append((hive, key))
        if (hive, key) not in _KNOWN_KEYS or hive not in pv_by_hive:
            raise OSError("clé absente")
        return _Handle(pv_by_hive[hive])

    def query_value(handle, name):
        assert name == "pv"
        return handle.pv, 1

    module.OpenKey = open_key
    module.QueryValueEx = query_value
    monkeypatch.setitem(sys.modules, "winreg", module)


def test_webview2_check_is_skipped_outside_windows(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    assert pictone.is_webview2_installed() is True


def test_webview2_detected_when_registry_has_version(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    _fake_winreg(monkeypatch, {"HKCU": "120.0.2210.91"}, [])
    assert pictone.is_webview2_installed() is True


def test_webview2_missing_when_no_key(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    _fake_winreg(monkeypatch, {}, [])
    assert pictone.is_webview2_installed() is False


def test_webview2_null_version_is_not_installed(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    _fake_winreg(monkeypatch, {"HKLM": "0.0.0.0", "HKCU": "0.0.0.0"}, [])
    assert pictone.is_webview2_installed() is False


def test_webview2_empty_version_is_not_installed(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    _fake_winreg(monkeypatch, {"HKLM": ""}, [])
    assert pictone.is_webview2_installed() is False


def test_webview2_checks_the_webview2_guid_keys(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    opened = []
    _fake_winreg(monkeypatch, {}, opened)
    pictone.is_webview2_installed()
    assert set(opened) == _KNOWN_KEYS


def test_webview2_without_winreg_module_is_assumed_present(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    monkeypatch.setitem(sys.modules, "winreg", None)  # import → ImportError
    assert pictone.is_webview2_installed() is True


# ---------------------------------------------------------------------------
# PicToneAPI.get_version / save_file
# ---------------------------------------------------------------------------

def _api(window=None):
    api = pictone.PicToneAPI()
    api._window = window
    return api


def test_get_version_returns_current_version(monkeypatch):
    monkeypatch.setattr(pictone, "CURRENT_VERSION", "4.5.6")
    assert _api().get_version() == "4.5.6"


def test_save_file_without_window_returns_false(fake_webview):
    assert _api(None).save_file("data:image/png;base64,AAAA", "a.png") is False


def test_save_file_writes_decoded_bytes(fake_webview, tmp_path):
    target = tmp_path / "out.png"
    payload = b"\x89PNG contenu"
    data_url = "data:image/png;base64," + base64.b64encode(payload).decode()
    assert _api(FakeWindow(dialog_result=str(target))).save_file(data_url, "out.png") is True
    assert target.read_bytes() == payload


def test_save_file_cancelled_writes_nothing(fake_webview, tmp_path):
    assert _api(FakeWindow(dialog_result=None)).save_file("data:image/png;base64,AAAA", "a.png") is False
    assert list(tmp_path.iterdir()) == []


def test_save_file_uses_first_path_from_list(fake_webview, tmp_path):
    target = tmp_path / "liste.png"
    data_url = "data:image/png;base64," + base64.b64encode(b"x").decode()
    window = FakeWindow(dialog_result=[str(target), str(tmp_path / "autre.png")])
    assert _api(window).save_file(data_url, "liste.png") is True
    assert target.read_bytes() == b"x"
    assert not (tmp_path / "autre.png").exists()


def test_save_file_empty_list_returns_false(fake_webview):
    assert _api(FakeWindow(dialog_result=[])).save_file("data:image/png;base64,AAAA", "a.png") is False


def test_save_file_passes_save_dialog_and_jpeg_filter(fake_webview):
    window = FakeWindow(dialog_result=None)
    _api(window).save_file("data:image/jpeg;base64,AAAA", "photo.jpg")
    kwargs = window.dialog_calls[0]
    assert kwargs["dialog_type"] == "SAVE_ENUM"
    assert kwargs["save_filename"] == "photo.jpg"
    assert kwargs["file_types"][0] == "Fichier JPEG (*.jpeg)"


def test_save_file_uses_legacy_dialog_constant_when_enum_missing(fake_webview):
    delattr(fake_webview, "FileDialog")
    window = FakeWindow(dialog_result=None)
    _api(window).save_file("data:image/png;base64,AAAA", "a.png")
    assert window.dialog_calls[0]["dialog_type"] == "SAVE_LEGACY"


def test_save_file_without_extension_defaults_to_png(fake_webview):
    window = FakeWindow(dialog_result=None)
    _api(window).save_file("data:image/png;base64,AAAA", "image")
    assert window.dialog_calls[0]["file_types"][0] == "Fichier PNG (*.png)"


def test_save_file_invalid_data_url_returns_false_and_logs(fake_webview, tmp_path, log_dir):
    target = tmp_path / "x.png"
    window = FakeWindow(dialog_result=str(target))
    assert _api(window).save_file("pas-une-data-url", "x.png") is False
    assert not target.exists()
    assert "Erreur lors de l'enregistrement" in open(log_dir / "crash_log.txt", encoding="utf-8").read()


# ---------------------------------------------------------------------------
# PicToneAPI.check_update / install_update
# ---------------------------------------------------------------------------

def test_check_update_reports_available_version(monkeypatch):
    monkeypatch.setattr(updater, "check", lambda current: {"available": True, "version": "3.3.0", "exe_name": "x"})
    assert _api().check_update() == {"available": True, "version": "3.3.0", "up_to_date": False}


def test_check_update_reports_nothing_available(monkeypatch):
    monkeypatch.setattr(updater, "check", lambda current: {"available": False})
    assert _api().check_update() == {"available": False, "version": "", "up_to_date": False}


def test_check_update_reports_up_to_date(monkeypatch):
    monkeypatch.setattr(updater, "check", lambda current: {"available": False, "up_to_date": True, "version": "3.3.1"})
    assert _api().check_update() == {"available": False, "version": "3.3.1", "up_to_date": True}


def test_check_update_passes_current_version_to_updater(monkeypatch):
    seen = []
    monkeypatch.setattr(pictone, "CURRENT_VERSION", "3.2.0")
    monkeypatch.setattr(updater, "check", lambda current: seen.append(current) or {"available": False})
    _api().check_update()
    assert seen == ["3.2.0"]


def test_check_update_error_is_swallowed_and_logged(monkeypatch, log_dir):
    def broken(current):
        raise RuntimeError("réseau coupé")

    monkeypatch.setattr(updater, "check", broken)
    assert _api().check_update() == {"available": False, "version": "", "up_to_date": False}
    assert "Vérification de mise à jour" in open(log_dir / "crash_log.txt", encoding="utf-8").read()


def test_install_update_without_check_is_refused(monkeypatch):
    result = _api().install_update()
    assert result == {"ok": False, "error": "Aucune mise à jour disponible."}


def test_install_update_failure_is_reported_and_window_kept(monkeypatch, log_dir):
    monkeypatch.setattr(updater, "can_self_update", lambda: True)
    api = _api(FakeWindow())
    api._update = {"available": True, "exe_url": "https://example/x"}

    def failing(update):
        raise RuntimeError("corrompu")

    monkeypatch.setattr(updater, "install", failing)
    assert api.install_update() == {"ok": False, "error": "corrompu"}
    assert api._window.destroyed is False


def test_install_update_success_closes_window(monkeypatch):
    monkeypatch.setattr(updater, "can_self_update", lambda: True)
    monkeypatch.setattr(pictone, "_schedule_exit", lambda: None)
    api = _api(FakeWindow())
    api._update = {"available": True, "exe_url": "https://example/x"}
    monkeypatch.setattr(updater, "install", lambda update: None)
    assert api.install_update() == {"ok": True}
    assert api._window.destroyed is True


def test_install_update_success_forces_process_exit(monkeypatch):
    monkeypatch.setattr(updater, "can_self_update", lambda: True)
    scheduled = []
    monkeypatch.setattr(pictone, "_schedule_exit", lambda: scheduled.append(True))
    api = _api(FakeWindow())
    api._update = {"available": True, "exe_url": "https://example/x"}
    monkeypatch.setattr(updater, "install", lambda update: None)
    api.install_update()
    assert scheduled == [True]


def test_install_update_success_without_window(monkeypatch):
    monkeypatch.setattr(updater, "can_self_update", lambda: True)
    monkeypatch.setattr(pictone, "_schedule_exit", lambda: None)
    api = _api(None)
    api._update = {"available": True, "exe_url": "https://example/x"}
    monkeypatch.setattr(updater, "install", lambda update: None)
    assert api.install_update() == {"ok": True}


def test_install_update_on_macos_opens_download_in_browser(monkeypatch):
    monkeypatch.setattr(updater, "can_self_update", lambda: False)
    opened = []
    monkeypatch.setattr(pictone.webbrowser, "open", lambda url: opened.append(url) or True)
    window = FakeWindow()
    api = _api(window)
    api._update = {"available": True, "exe_url": "https://github.com/x/PicTone_v3.4.0_macOS.dmg"}
    assert api.install_update() == {"ok": True, "manual": True}
    assert opened == ["https://github.com/x/PicTone_v3.4.0_macOS.dmg"]
    assert window.destroyed is False  # l'app reste ouverte


def test_install_update_on_macos_reports_browser_error(monkeypatch):
    monkeypatch.setattr(updater, "can_self_update", lambda: False)

    def broken(url):
        raise OSError("navigateur absent")

    monkeypatch.setattr(pictone.webbrowser, "open", broken)
    api = _api(FakeWindow())
    api._update = {"available": True, "exe_url": "https://example/x.dmg"}
    assert api.install_update() == {"ok": False, "error": "navigateur absent"}


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def test_main_refuses_to_start_without_webview2(monkeypatch, fake_webview):
    monkeypatch.setattr(pictone, "is_webview2_installed", lambda: False)
    shown = []
    monkeypatch.setattr(pictone, "show_error", lambda message: shown.append(message))
    assert pictone.main() == 1
    assert "https://go.microsoft.com/fwlink/p/?LinkId=2124703" in shown[0]
    assert fake_webview.created == []


@pytest.mark.parametrize("is_windows", [True, False])
def test_main_creates_window_and_starts_app(monkeypatch, fake_webview, is_windows):
    monkeypatch.setattr(pictone, "is_webview2_installed", lambda: True)
    monkeypatch.setattr(pictone, "CURRENT_VERSION", "3.3.0")
    monkeypatch.setattr(pictone, "IS_WINDOWS", is_windows)

    assert pictone.main() == 0

    kwargs = fake_webview.created[0]
    assert kwargs["title"] == "PicTone  \u2014  v3.3.0"
    assert kwargs["min_size"] == (960, 640)
    assert kwargs["width"] == 1300 and kwargs["height"] == 820
    assert kwargs["resizable"] is True
    assert kwargs["url"] == pictone.resource_path("web", "index.html")
    assert kwargs["js_api"]._window is fake_webview.window
    start = fake_webview.started[0]
    assert start["http_server"] is True
    assert start["private_mode"] is False
    if is_windows:
        assert start["icon"] == pictone.resource_path("pictone.ico")
    else:
        assert "icon" not in start


def test_log_js_writes_interface_traces_to_update_log(log_dir):
    assert _api().log_js("clic sur le bouton") is True
    text = open(log_dir / "update.log", encoding="utf-8").read()
    assert "[interface] clic sur le bouton" in text


# ---------------------------------------------------------------------------
# Menus natifs
# ---------------------------------------------------------------------------

class _CommandWindow:
    def __init__(self):
        self.scripts = []
        self.destroyed = False

    def evaluate_js(self, script):
        self.scripts.append(script)

    def destroy(self):
        self.destroyed = True


def _menu_api(window=None):
    api = _api()
    api._window = window
    return api


def _find_item(menus, menu_title, prefix):
    menu = next(m for m in menus if m["title"] == menu_title)
    return next(i for i in menu["items"] if i.get("title", "").startswith(prefix))


@pytest.mark.parametrize("is_mac, undo_label", [(True, "Annuler  (⌘Z)"), (False, "Annuler  (Ctrl+Z)")])
def test_menu_labels_use_platform_shortcuts(monkeypatch, is_mac, undo_label):
    monkeypatch.setattr(pictone, "IS_MAC", is_mac)
    monkeypatch.setattr(pictone, "IS_WINDOWS", not is_mac)
    menus = pictone.build_menus(_menu_api())
    assert _find_item(menus, "Édition", "Annuler")["title"] == undo_label


def test_menu_commands_send_matching_js_command(monkeypatch):
    monkeypatch.setattr(pictone, "IS_MAC", True)
    window = _CommandWindow()
    menus = pictone.build_menus(_menu_api(window))
    _find_item(menus, "Édition", "Annuler")["action"]()
    _find_item(menus, "Fichier", "Enregistrer")["action"]()
    assert window.scripts == ["picToneCommand('undo')", "picToneCommand('save')"]


def test_windows_file_menu_has_quit_but_mac_does_not(monkeypatch):
    monkeypatch.setattr(pictone, "IS_WINDOWS", True)
    window = _CommandWindow()
    menus = pictone.build_menus(_menu_api(window))
    _find_item(menus, "Fichier", "Quitter")["action"]()
    assert window.destroyed is True

    monkeypatch.setattr(pictone, "IS_WINDOWS", False)
    mac_menus = pictone.build_menus(_menu_api(window))
    assert not any(i.get("title") == "Quitter" for i in next(m for m in mac_menus if m["title"] == "Fichier")["items"])


def test_help_menu_shows_version_message(monkeypatch):
    monkeypatch.setattr(pictone, "CURRENT_VERSION", "3.3.0")
    window = _CommandWindow()
    menus = pictone.build_menus(_menu_api(window))
    _find_item(menus, "Aide", "À propos")["action"]()
    assert "PicTone 3.3.0" in window.scripts[0]
    assert window.scripts[0].startswith("setTimeout(() => alert(")


def test_check_updates_menu_asks_interface_to_check(monkeypatch):
    window = _CommandWindow()
    menus = pictone.build_menus(_menu_api(window))
    _find_item(menus, "Aide", "Vérifier")["action"]()
    assert window.scripts == ["picToneCommand('checkUpdates')"]


def test_to_pywebview_menus_converts_structure(fake_webview):
    menus = pictone.build_menus(_menu_api(_CommandWindow()))
    converted = pictone.to_pywebview_menus(menus)
    assert [m.title for m in converted] == ["Fichier", "Édition", "Affichage", "Aide"]
    file_items = converted[0].items
    assert type(file_items[0]).__name__ == "MenuAction"


def test_command_labels_map_native_titles_to_commands(monkeypatch):
    monkeypatch.setattr(pictone, "IS_MAC", True)
    spec = pictone.build_menus(_menu_api(_CommandWindow()))
    labels = pictone.command_labels(spec)
    assert labels["Enregistrer l'image…"] == "save"
    assert labels["Annuler"] == "undo"
    assert labels["Vérifier les mises à jour"] == "checkUpdates"


def test_set_command_states_forwards_booleans_to_menus(monkeypatch):
    sent = []
    monkeypatch.setattr(pictone, "apply_menu_states", lambda window, labels, states: sent.append(states))
    api = _menu_api(_CommandWindow())
    api._menu_labels = {"Annuler": "undo"}
    assert api.set_command_states({"undo": 0, "save": "yes"}) is True
    assert sent == [{"undo": False, "save": True}]


def test_set_command_states_rejects_non_dict(monkeypatch):
    monkeypatch.setattr(pictone, "apply_menu_states", lambda *a: pytest.fail("ne doit pas être appelé"))
    assert _menu_api(_CommandWindow()).set_command_states(["undo"]) is False
