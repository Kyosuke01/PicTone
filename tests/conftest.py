"""Fixtures partagées. Les tests n'ont pas besoin de pywebview ni de Windows."""

import sys
import types

import pytest

import pictone


class FakeWindow:
    """Remplace une fenêtre pywebview."""

    def __init__(self, dialog_result=None):
        self.dialog_result = dialog_result
        self.dialog_calls = []
        self.destroyed = False

    def create_file_dialog(self, **kwargs):
        self.dialog_calls.append(kwargs)
        return self.dialog_result

    def destroy(self):
        self.destroyed = True


@pytest.fixture
def fake_webview(monkeypatch):
    """Installe un faux module `webview` (SAVE_DIALOG et FileDialog.SAVE distincts)."""
    module = types.ModuleType("webview")
    module.FileDialog = types.SimpleNamespace(SAVE="SAVE_ENUM")
    module.SAVE_DIALOG = "SAVE_LEGACY"
    module.window = FakeWindow()
    module.created = []
    module.started = []

    def create_window(**kwargs):
        module.created.append(kwargs)
        return module.window

    module.create_window = create_window
    module.start = lambda **kwargs: module.started.append(kwargs)

    menu_module = types.ModuleType("webview.menu")

    class Menu:
        def __init__(self, title, items=None):
            self.title, self.items = title, items or []

    class MenuAction:
        def __init__(self, title, function):
            self.title, self.function = title, function

    class MenuSeparator:
        pass

    menu_module.Menu, menu_module.MenuAction, menu_module.MenuSeparator = Menu, MenuAction, MenuSeparator
    module.menu = menu_module
    monkeypatch.setitem(sys.modules, "webview", module)
    monkeypatch.setitem(sys.modules, "webview.menu", menu_module)
    return module


@pytest.fixture
def log_dir(tmp_path, monkeypatch):
    """Redirige les journaux vers un dossier temporaire."""
    target = tmp_path / "logs"
    monkeypatch.setattr(pictone, "_log_candidates", lambda: iter([str(target)]))
    return target
