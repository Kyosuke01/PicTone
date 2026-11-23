"""Tests des scripts de build : version, ressource de version, commande PyInstaller, nettoyage."""

import shutil
import subprocess
import sys
import types
from pathlib import Path

import pytest

import build_common
import build_exe

REPO = Path(build_common.ROOT)


# ---------------------------------------------------------------------------
# build_common.get_version / version_tuple
# ---------------------------------------------------------------------------

def test_get_version_reads_and_strips(tmp_path):
    (tmp_path / "version.txt").write_text("  3.2.0\n", encoding="utf-8")
    assert build_common.get_version(tmp_path) == "3.2.0"


def test_get_version_missing_file_exits(tmp_path):
    with pytest.raises(SystemExit) as info:
        build_common.get_version(tmp_path)
    assert "introuvable" in str(info.value.code)


@pytest.mark.parametrize("content", ["abc", "v3.2.0", "3.2.0-beta", "", "1.2.3.4.5"])
def test_get_version_rejects_invalid_content(tmp_path, content):
    (tmp_path / "version.txt").write_text(content, encoding="utf-8")
    with pytest.raises(SystemExit) as info:
        build_common.get_version(tmp_path)
    assert "invalide" in str(info.value.code)


@pytest.mark.parametrize("content", ["1", "1.2", "1.2.3", "1.2.3.4"])
def test_get_version_accepts_one_to_four_parts(tmp_path, content):
    (tmp_path / "version.txt").write_text(content, encoding="utf-8")
    assert build_common.get_version(tmp_path) == content


def test_get_version_defaults_to_repository_root():
    assert build_common.get_version() == (REPO / "version.txt").read_text(encoding="utf-8").strip()


@pytest.mark.parametrize(
    "version, expected",
    [("3.0.0", (3, 0, 0, 0)), ("3", (3, 0, 0, 0)), ("1.2", (1, 2, 0, 0)), ("1.2.3.4", (1, 2, 3, 4))],
)
def test_version_tuple_pads_to_four_parts(version, expected):
    assert build_common.version_tuple(version) == expected


# ---------------------------------------------------------------------------
# build_exe.version_info_text / write_version_info
# ---------------------------------------------------------------------------

def test_version_info_declares_every_string_field():
    text = build_exe.version_info_text("3.2.1")
    expected = {
        "CompanyName": "PicTone",
        "InternalName": "PicTone",
        "LegalCopyright": "Copyright (c) 2026 PicTone",
        "OriginalFilename": "PicTone_v3.2.1_Windows.exe",
        "ProductName": "PicTone",
        "ProductVersion": "3.2.1",
        "FileVersion": "3.2.1",
    }
    for field, value in expected.items():
        assert f"StringStruct('{field}', '{value}')" in text
    assert "StringStruct('FileDescription', \"PicTone - Editeur d'images local\")" in text
    assert "VarStruct('Translation', [1033, 1200])" in text


def test_version_info_contains_numeric_and_string_versions():
    text = build_exe.version_info_text("3.2.1")
    assert "filevers=(3, 2, 1, 0)" in text
    assert "prodvers=(3, 2, 1, 0)" in text
    assert "StringStruct('FileVersion', '3.2.1')" in text
    assert "StringStruct('OriginalFilename', 'PicTone_v3.2.1_Windows.exe')" in text


def test_write_version_info_writes_to_target(monkeypatch, tmp_path):
    target = tmp_path / "file_version_info.txt"
    monkeypatch.setattr(build_exe, "VERSION_INFO_FILE", target)
    returned = build_exe.write_version_info("4.0.0")
    assert returned == target
    assert "filevers=(4, 0, 0, 0)" in target.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# build_exe.pyinstaller_command
# ---------------------------------------------------------------------------

def _value_after(cmd, flag):
    return cmd[cmd.index(flag) + 1]


def _all_values(cmd, flag):
    return [cmd[i + 1] for i, item in enumerate(cmd) if item == flag]


def test_windows_command_pairs_each_flag_with_its_value():
    cmd = build_exe.pyinstaller_command("x", platform="win32", sep=";")
    assert "--noconfirm" in cmd
    assert _value_after(cmd, "--distpath") == str(build_exe.OUT_DIR)
    assert _value_after(cmd, "--collect-all") == "webview"
    assert _all_values(cmd, "--add-data") == ["web;web", "version.txt;.", "pictone.ico;."]
    assert _all_values(cmd, "--hidden-import") == ["webview.platforms.winforms", "clr_loader", "pythonnet"]


def test_macos_command_pairs_each_flag_with_its_value():
    cmd = build_exe.pyinstaller_command("x", platform="darwin", sep=":")
    assert _value_after(cmd, "--osx-bundle-identifier") == "fr.kyo.pictone"
    assert _value_after(cmd, "--distpath") == str(build_exe.OUT_DIR)
    assert _all_values(cmd, "--add-data") == ["web:web", "version.txt:."]
    assert _all_values(cmd, "--hidden-import") == ["webview.platforms.cocoa"]


def test_windows_command_builds_a_single_noconsole_exe():
    cmd = build_exe.pyinstaller_command("PicTone_v1.0.0", platform="win32", sep=";")
    assert "--onefile" in cmd and "--noconsole" in cmd
    assert "--windowed" not in cmd and "--onedir" not in cmd
    assert cmd[cmd.index("--name") + 1] == "PicTone_v1.0.0"
    assert cmd[cmd.index("--icon") + 1] == "pictone.ico"
    assert "web;web" in cmd and "version.txt;." in cmd and "pictone.ico;." in cmd
    assert cmd[cmd.index("--version-file") + 1] == str(build_exe.VERSION_INFO_FILE)
    assert "webview.platforms.winforms" in cmd
    assert cmd[-1] == "pictone.py"


def test_windows_command_uses_semicolon_separator_for_data():
    cmd = build_exe.pyinstaller_command("x", platform="win32", sep=";")
    assert "web;web" in cmd
    assert "web:web" not in cmd


def test_macos_command_builds_a_windowed_app_bundle():
    cmd = build_exe.pyinstaller_command("PicTone_v1.0.0", platform="darwin", sep=":")
    assert "--windowed" in cmd and "--onedir" in cmd
    assert "--onefile" not in cmd and "--noconsole" not in cmd
    assert "--version-file" not in cmd
    assert cmd[cmd.index("--icon") + 1] == "pictone.icns"
    assert "web:web" in cmd and "version.txt:." in cmd
    assert "webview.platforms.cocoa" in cmd
    assert "webview.platforms.winforms" not in cmd
    assert cmd[-1] == "pictone.py"


def test_command_writes_into_build_portable_dir():
    cmd = build_exe.pyinstaller_command("x", platform="darwin", sep=":")
    assert cmd[cmd.index("--distpath") + 1] == str(build_exe.OUT_DIR)
    assert build_exe.OUT_DIR.name == "build_portable"


def test_command_uses_current_interpreter_and_pyinstaller_module():
    cmd = build_exe.pyinstaller_command("x", platform="darwin", sep=":")
    assert cmd[:3] == [sys.executable, "-m", "PyInstaller"]


def test_command_defaults_to_current_platform(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    assert "--windowed" in build_exe.pyinstaller_command("x")


def test_command_rejects_unsupported_platform():
    with pytest.raises(ValueError, match="non prise en charge"):
        build_exe.pyinstaller_command("x", platform="linux")


def test_artifact_path_is_exe_on_windows_and_app_on_macos():
    assert build_exe.artifact_path("PicTone_v1", platform="win32") == build_exe.OUT_DIR / "PicTone_v1.exe"
    assert build_exe.artifact_path("PicTone_v1", platform="darwin") == build_exe.OUT_DIR / "PicTone_v1.app"


# ---------------------------------------------------------------------------
# build_exe.make_icns
# ---------------------------------------------------------------------------

def test_make_icns_creates_a_real_icns_file(tmp_path):
    target = build_exe.make_icns(REPO / "pictone.ico", tmp_path / "pictone.icns")
    data = target.read_bytes()
    assert data[:4] == b"icns"
    assert len(data) > 1000


# ---------------------------------------------------------------------------
# build_exe.cleanup
# ---------------------------------------------------------------------------

def test_cleanup_removes_temporary_build_files(monkeypatch, tmp_path):
    monkeypatch.setattr(build_exe, "ROOT", tmp_path)
    monkeypatch.setattr(build_exe, "VERSION_INFO_FILE", tmp_path / "file_version_info.txt")
    (tmp_path / "file_version_info.txt").write_text("x")
    (tmp_path / "PicTone_v1.spec").write_text("x")
    (tmp_path / "build").mkdir()
    (tmp_path / "build" / "junk").write_text("x")

    build_exe.cleanup("PicTone_v1")

    assert not (tmp_path / "file_version_info.txt").exists()
    assert not (tmp_path / "PicTone_v1.spec").exists()
    assert not (tmp_path / "build").exists()


def test_cleanup_tolerates_missing_files(monkeypatch, tmp_path):
    monkeypatch.setattr(build_exe, "ROOT", tmp_path)
    monkeypatch.setattr(build_exe, "VERSION_INFO_FILE", tmp_path / "absent.txt")
    build_exe.cleanup("PicTone_v1")  # ne doit pas lever d'exception


# ---------------------------------------------------------------------------
# build_exe.main
# ---------------------------------------------------------------------------

@pytest.fixture
def build_sandbox(monkeypatch, tmp_path):
    """Isole main() dans un dossier temporaire avec un faux PyInstaller."""
    monkeypatch.chdir(tmp_path)
    shutil.copy(REPO / "pictone.ico", tmp_path / "pictone.ico")
    (tmp_path / "version.txt").write_text("5.1.0", encoding="utf-8")
    monkeypatch.setattr(build_exe, "ROOT", tmp_path)
    monkeypatch.setattr(build_exe, "OUT_DIR", tmp_path / "build_portable")
    monkeypatch.setattr(build_exe, "VERSION_INFO_FILE", tmp_path / "file_version_info.txt")
    monkeypatch.setattr(build_exe, "ICNS_FILE", tmp_path / "pictone.icns")
    monkeypatch.setattr(build_common, "ROOT", tmp_path)
    monkeypatch.setitem(sys.modules, "PyInstaller", types.ModuleType("PyInstaller"))
    monkeypatch.setattr(build_exe, "get_version", lambda: "5.1.0")
    runs = []
    kwargs_seen = []
    info_at_build = []

    def fake_run(args, **kwargs):
        runs.append(args)
        kwargs_seen.append(kwargs)
        if args[0] == "taskkill":
            return None
        info_at_build.append(build_exe.VERSION_INFO_FILE.exists())
        (tmp_path / "build_portable").mkdir(exist_ok=True)
        (tmp_path / "build").mkdir(exist_ok=True)  # artefacts créés par PyInstaller
        (tmp_path / f"{build_exe.build_name('5.1.0')}.spec").write_text("x")
        return subprocess.CompletedProcess(args, 0)

    monkeypatch.setattr(build_exe.subprocess, "run", fake_run)
    return types.SimpleNamespace(root=tmp_path, runs=runs, kwargs_seen=kwargs_seen, info_at_build=info_at_build)


def test_main_runs_pyinstaller_with_check_and_cleans_up(build_sandbox, monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")  # cas macOS : .icns puis commande PyInstaller
    build_exe.main()
    pyinstaller_calls = [r for r in build_sandbox.runs if "PyInstaller" in r]
    assert len(pyinstaller_calls) == 1
    assert pyinstaller_calls[0][pyinstaller_calls[0].index("--name") + 1] == "PicTone"
    assert any(k.get("check") is True for k in build_sandbox.kwargs_seen)
    assert (build_sandbox.root / "pictone.icns").read_bytes()[:4] == b"icns"
    assert not (build_sandbox.root / "build").exists()
    assert not (build_sandbox.root / "PicTone.spec").exists()
    assert not (build_sandbox.root / "file_version_info.txt").exists()


def test_main_on_windows_writes_version_info_then_builds_exe(build_sandbox, monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    build_exe.main()
    assert build_sandbox.info_at_build == [True]  # ressource de version présente pendant le build
    assert ["taskkill", "/F", "/IM", "PicTone_v5.1.0_Windows.exe"] in build_sandbox.runs
    pyi = [r for r in build_sandbox.runs if "PyInstaller" in r][0]
    assert "--onefile" in pyi and "--noconsole" in pyi
    assert not (build_sandbox.root / "file_version_info.txt").exists()


def test_main_exits_with_message_when_pyinstaller_fails(build_sandbox, monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")

    def failing(args, **kwargs):
        if "PyInstaller" in args and kwargs.get("check"):
            raise subprocess.CalledProcessError(2, args)
        return None

    monkeypatch.setattr(build_exe.subprocess, "run", failing)
    with pytest.raises(SystemExit) as info:
        build_exe.main()
    assert "code 2" in str(info.value.code)


def test_main_exits_when_pyinstaller_is_missing(build_sandbox, monkeypatch):
    monkeypatch.delitem(sys.modules, "PyInstaller")
    import builtins
    real_import = builtins.__import__

    def no_pyinstaller(name, *args, **kwargs):
        if name == "PyInstaller":
            raise ImportError("absent")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_pyinstaller)
    with pytest.raises(SystemExit) as info:
        build_exe.main()
    assert "PyInstaller est introuvable" in str(info.value.code)
