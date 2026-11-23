"""Tests de updater.py : détection de version, sécurité des URLs, téléchargement et installation."""

import hashlib
import io
import json
import os
import sys
import types

import pytest

import updater

BASE = "https://github.com/Kyosuke01/PicTone/releases/download/v3.3.0/"
LATEST = "https://api.github.com/repos/Kyosuke01/PicTone/releases/latest"
SETUP_NAME = "PicTone_v3.3.0_Windows.exe"
SUMS_URL = BASE + "SHA256SUMS.txt"
SETUP_URL = BASE + SETUP_NAME


def bytes_source(mapping):
    """Remplace updater._open : renvoie le contenu associé à l'URL, sinon une erreur réseau."""

    def _open(url):
        if url not in mapping:
            raise OSError(f"URL inattendue : {url}")
        return io.BytesIO(mapping[url])

    return _open


def release_json(tag="v3.3.0", assets=None):
    if assets is None:
        assets = [
            {"name": SETUP_NAME, "browser_download_url": SETUP_URL},
            {"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL},
        ]
    return json.dumps({"tag_name": tag, "assets": assets}).encode()


@pytest.fixture
def windows_frozen(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(sys, "frozen", True, raising=False)


# ---------------------------------------------------------------------------
# _parse
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "text, expected",
    [("v3.0.1", (3, 0, 1)), ("3.0.1", (3, 0, 1)), ("3.0", (3, 0)), ("3", (3,)), (" 3.1.0 ", (3, 1, 0))],
)
def test_parse_accepts_numeric_versions(text, expected):
    assert updater._parse(text) == expected


@pytest.mark.parametrize("text", ["latest", "", None, "3.0.1-beta", "v", "3..1", "1.2.3.4.5"])
def test_parse_rejects_non_numeric_versions(text):
    assert updater._parse(text) is None


def test_parse_orders_numerically_not_alphabetically():
    assert updater._parse("3.10.0") > updater._parse("3.9.9")


# ---------------------------------------------------------------------------
# can_self_update
# ---------------------------------------------------------------------------

def test_can_self_update_only_when_frozen_on_windows(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert updater.can_self_update() is True


def test_can_self_update_false_when_running_from_source(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.delattr(sys, "frozen", raising=False)
    assert updater.can_self_update() is False


def test_can_self_update_false_on_macos(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert updater.can_self_update() is False


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

def test_check_returns_newer_installer(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json()}))
    assert updater.check("3.2.0") == {
        "available": True,
        "version": "3.3.0",
        "exe_name": SETUP_NAME,
        "exe_url": SETUP_URL,
        "sums_url": SUMS_URL,
    }


def test_check_nothing_when_not_frozen(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.delattr(sys, "frozen", raising=False)

    def must_not_be_called(url):
        raise AssertionError("le réseau ne doit pas être interrogé")

    monkeypatch.setattr(updater, "_open", must_not_be_called)
    assert updater.check("3.2.0") == {"available": False}


MAC_DMG = "PicTone_v3.3.0_macOS.dmg"


def test_check_finds_macos_dmg(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assets = [
        {"name": MAC_DMG, "browser_download_url": BASE + MAC_DMG},
        {"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL},
    ]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    info = updater.check("3.2.0")
    assert info["available"] is True
    assert info["exe_name"] == MAC_DMG
    assert info["exe_url"] == BASE + MAC_DMG


def test_check_ignores_windows_installer_on_macos(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json()}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_reports_up_to_date_on_macos(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(tag="v3.3.0")}))
    assert updater.check("3.3.0") == {"available": False, "up_to_date": True, "version": "3.3.0"}


def test_check_reports_up_to_date_for_same_version(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(tag="v3.2.0")}))
    assert updater.check("3.2.0") == {"available": False, "up_to_date": True, "version": "3.2.0"}


def test_check_reports_up_to_date_for_older_release(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(tag="v3.1.9")}))
    assert updater.check("3.2.0") == {"available": False, "up_to_date": True, "version": "3.1.9"}


def test_check_compares_numbers_not_strings(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(tag="v3.9.0")}))
    assert updater.check("3.10.0")["up_to_date"] is True


def test_check_accepts_tag_without_v_prefix(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(tag="3.3.0")}))
    assert updater.check("3.2.0")["version"] == "3.3.0"


def test_check_nothing_for_unparseable_current_version(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json()}))
    assert updater.check("unknown") == {"available": False}


def test_check_nothing_when_network_fails(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_nothing_on_invalid_json(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: b"<html>erreur</html>"}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_nothing_when_release_is_not_an_object(windows_frozen, monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: b"[]"}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_nothing_without_checksums_file(windows_frozen, monkeypatch):
    assets = [{"name": SETUP_NAME, "browser_download_url": SETUP_URL}]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_nothing_without_installer(windows_frozen, monkeypatch):
    assets = [{"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL}]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_ignores_portable_and_macos_assets(windows_frozen, monkeypatch):
    assets = [
        {"name": "PicTone_v3.3.0_Windows-portable.exe", "browser_download_url": BASE + "PicTone_v3.3.0_Windows-portable.exe"},
        {"name": "PicTone_v3.3.0_macOS.dmg", "browser_download_url": BASE + "PicTone_v3.3.0_macOS.dmg"},
        {"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL},
    ]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_ignores_setup_named_installer(windows_frozen, monkeypatch):
    """Le nom 'Setup' a été retiré : une release ancienne ne doit plus être reconnue."""
    name = "PicTone_Setup_v3.3.0.exe"
    assets = [
        {"name": name, "browser_download_url": BASE + name},
        {"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL},
    ]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_refuses_download_from_another_host(windows_frozen, monkeypatch):
    assets = [
        {"name": SETUP_NAME, "browser_download_url": "https://evil.example/PicTone_v3.3.0_Windows.exe"},
        {"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL},
    ]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_refuses_checksums_from_another_host(windows_frozen, monkeypatch):
    assets = [
        {"name": SETUP_NAME, "browser_download_url": SETUP_URL},
        {"name": "SHA256SUMS.txt", "browser_download_url": "https://evil.example/SHA256SUMS.txt"},
    ]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0") == {"available": False}


def test_check_skips_malformed_asset_entries(windows_frozen, monkeypatch):
    assets = ["pas un objet", {"name": SETUP_NAME, "browser_download_url": SETUP_URL},
              {"name": "SHA256SUMS.txt", "browser_download_url": SUMS_URL}]
    monkeypatch.setattr(updater, "_open", bytes_source({LATEST: release_json(assets=assets)}))
    assert updater.check("3.2.0")["available"] is True


# ---------------------------------------------------------------------------
# _expected_hash / _download
# ---------------------------------------------------------------------------

def test_expected_hash_finds_the_right_line(monkeypatch):
    sums = f"{'a' * 64}  {SETUP_NAME}\n{'b' * 64}  autre.exe\n".encode()
    monkeypatch.setattr(updater, "_open", bytes_source({SUMS_URL: sums}))
    assert updater._expected_hash(SUMS_URL, SETUP_NAME) == "a" * 64
    assert updater._expected_hash(SUMS_URL, "autre.exe") == "b" * 64


def test_expected_hash_is_lowercase(monkeypatch):
    sums = f"{'AB' * 32}  {SETUP_NAME}\n".encode()
    monkeypatch.setattr(updater, "_open", bytes_source({SUMS_URL: sums}))
    assert updater._expected_hash(SUMS_URL, SETUP_NAME) == "ab" * 32


def test_expected_hash_missing_entry_raises(monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({SUMS_URL: b"abc  autre.exe\n"}))
    with pytest.raises(RuntimeError, match="Empreinte introuvable"):
        updater._expected_hash(SUMS_URL, SETUP_NAME)


def test_expected_hash_requires_two_spaces_separator(monkeypatch):
    monkeypatch.setattr(updater, "_open", bytes_source({SUMS_URL: f"{'c' * 64} {SETUP_NAME}\n".encode()}))
    with pytest.raises(RuntimeError):
        updater._expected_hash(SUMS_URL, SETUP_NAME)


def test_download_writes_file_and_returns_sha256(monkeypatch, tmp_path):
    content = b"installeur " * 100000  # plusieurs morceaux de lecture
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: content}))
    destination = tmp_path / "setup.exe"
    digest = updater._download(SETUP_URL, str(destination))
    assert destination.read_bytes() == content
    assert digest == hashlib.sha256(content).hexdigest()


def test_download_propagates_network_errors(monkeypatch, tmp_path):
    monkeypatch.setattr(updater, "_open", bytes_source({}))
    with pytest.raises(OSError):
        updater._download(SETUP_URL, str(tmp_path / "setup.exe"))


# ---------------------------------------------------------------------------
# install
# ---------------------------------------------------------------------------

UPDATE = {
    "available": True,
    "version": "3.3.0",
    "exe_name": SETUP_NAME,
    "exe_url": SETUP_URL,
    "sums_url": SUMS_URL,
}


@pytest.fixture
def installed_app(monkeypatch, tmp_path):
    """Simule PicTone installé : un exe dans un dossier, et un Popen enregistré."""
    app_dir = tmp_path / "Programs" / "PicTone"
    app_dir.mkdir(parents=True)
    exe = app_dir / "PicTone.exe"
    exe.write_bytes(b"ancienne version")
    monkeypatch.setattr(sys, "executable", str(exe))
    monkeypatch.setattr(updater, "can_self_update", lambda: True)
    launched = []
    monkeypatch.setattr(updater.subprocess, "Popen", lambda args, **kwargs: launched.append((args, kwargs)))
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.setattr(updater.tempfile, "mkdtemp", lambda prefix="": str(work))  # aucun dossier hors du test
    return types.SimpleNamespace(exe=exe, app_dir=app_dir, launched=launched)


def test_repository_urls_point_to_the_public_repo():
    assert updater.LATEST_URL == LATEST
    assert updater.DOWNLOAD_PREFIX == "https://github.com/Kyosuke01/PicTone/releases/download/"


def test_open_sends_user_agent_and_timeout(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["agent"] = request.get_header("User-agent")
        seen["timeout"] = timeout
        return "reponse"

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)
    assert updater._open(LATEST) == "reponse"
    assert seen == {"url": LATEST, "agent": "PicTone-updater", "timeout": 10}


def test_batch_encoding_is_mbcs_on_windows(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    assert updater._batch_encoding() == "mbcs"


def test_batch_encoding_is_utf8_elsewhere(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    assert updater._batch_encoding() == "utf-8"


def test_install_refused_when_not_self_updatable(monkeypatch):
    monkeypatch.setattr(updater, "can_self_update", lambda: False)
    with pytest.raises(RuntimeError, match="application Windows"):
        updater.install(UPDATE)


def test_install_refuses_corrupted_download_and_keeps_app(monkeypatch, installed_app):
    monkeypatch.setattr(updater, "_expected_hash", lambda url, name: "0" * 64)
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: "fichier altéré".encode("utf-8")}))
    with pytest.raises(RuntimeError, match="corrompu"):
        updater.install(UPDATE)
    assert installed_app.launched == []
    assert installed_app.exe.read_bytes() == b"ancienne version"


def test_install_checks_the_expected_entry_name(monkeypatch, installed_app):
    seen = []

    def fake_expected(url, name):
        seen.append((url, name))
        return hashlib.sha256(b"x").hexdigest()

    monkeypatch.setattr(updater, "_expected_hash", fake_expected)
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: b"x"}))
    updater.install(UPDATE)
    assert seen == [(SUMS_URL, SETUP_NAME)]


def test_install_downloads_verifies_and_launches_silent_installer(monkeypatch, installed_app):
    content = b"nouvel installeur"
    digest = hashlib.sha256(content).hexdigest()
    monkeypatch.setattr(updater, "_expected_hash", lambda url, name: digest)
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: content}))

    updater.install(UPDATE)

    assert len(installed_app.launched) == 1
    args, kwargs = installed_app.launched[0]
    assert args[0] == "cmd" and args[1] == "/c"
    script = args[2]
    setup = os.path.join(os.path.dirname(script), SETUP_NAME)
    assert open(setup, "rb").read() == content

    raw = open(script, "rb").read()
    assert raw.count(b"\r\n") == raw.count(b"\n") > 0  # fins de ligne Windows
    text = raw.decode(updater._batch_encoding())
    assert f'"{setup}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="{installed_app.app_dir}"' in text
    assert f'start "" "{installed_app.exe}"' in text
    assert f"PID eq {os.getpid()}" in text
    assert text.index(":wait") < text.index(":run") < text.index("/VERYSILENT")
    assert f'tasklist /FI "PID eq {os.getpid()}" /NH 2>nul | find "{os.getpid()}" >nul' in text
    assert "if errorlevel 1 goto run" in text
    assert "ping 127.0.0.1 -n 2 -w 500 >nul" in text
    assert "if %TRIES% GEQ 240 goto timeout" in text           # abandon après 120 s, pas de boucle infinie
    assert "goto wait" in text
    assert kwargs["close_fds"] is True


def test_install_launches_detached_on_windows(monkeypatch, installed_app):
    content = b"x"
    monkeypatch.setattr(updater, "_expected_hash", lambda url, name: hashlib.sha256(content).hexdigest())
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: content}))
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(updater, "_batch_encoding", lambda: "utf-8")
    updater.install(UPDATE)
    _, kwargs = installed_app.launched[0]
    assert kwargs["creationflags"] == 0x00000200 | 0x08000000  # nouveau groupe + console cachée, sans fenêtre visible


def test_install_never_overwrites_the_running_exe_directly(monkeypatch, installed_app):
    content = b"nouvel installeur"
    monkeypatch.setattr(updater, "_expected_hash", lambda url, name: hashlib.sha256(content).hexdigest())
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: content}))
    updater.install(UPDATE)
    assert installed_app.exe.read_bytes() == b"ancienne version"


def test_install_batch_deletes_itself_at_the_end(monkeypatch, installed_app):
    content = b"x"
    monkeypatch.setattr(updater, "_expected_hash", lambda url, name: hashlib.sha256(content).hexdigest())
    monkeypatch.setattr(updater, "_open", bytes_source({SETUP_URL: content}))
    updater.install(UPDATE)
    text = open(installed_app.launched[0][0][2], encoding=updater._batch_encoding()).read()
    assert 'del /f /q "%~f0"' in text


# ---------------------------------------------------------------------------
# macOS : remplacement du .app
# ---------------------------------------------------------------------------

@pytest.fixture
def mac_app(monkeypatch, tmp_path):
    """Simule PicTone.app figée : bundle dans tmp_path, Popen enregistré, téléchargement factice."""
    app = tmp_path / "Applications" / "PicTone.app"
    (app / "Contents" / "MacOS").mkdir(parents=True)
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(app / "Contents" / "MacOS" / "PicTone"))
    launched = []
    monkeypatch.setattr(updater.subprocess, "Popen", lambda args, **kwargs: launched.append((args, kwargs)))
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.setattr(updater.tempfile, "mkdtemp", lambda prefix="": str(work))
    staged_source = tmp_path / "staged" / "PicTone.app"
    staged_source.mkdir(parents=True)
    monkeypatch.setattr(updater, "stage_macos_app", lambda update, work_dir: str(staged_source))
    return types.SimpleNamespace(app=app, work=work, launched=launched, staged=staged_source)


MAC_UPDATE = {"available": True, "version": "3.4.0", "exe_name": MAC_DMG,
              "exe_url": BASE + MAC_DMG, "sums_url": SUMS_URL}


def test_app_bundle_path_finds_the_bundle(mac_app):
    assert updater.app_bundle_path() == str(mac_app.app)


def test_can_update_macos_only_in_frozen_bundle(monkeypatch, mac_app):
    assert updater.can_update_macos() is True
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    assert updater.can_update_macos() is False


def test_install_macos_refused_outside_a_bundle(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(tmp_path / "PicTone"))
    with pytest.raises(RuntimeError, match="application Mac"):
        updater.install_macos(MAC_UPDATE)


def test_install_macos_refused_without_write_access(monkeypatch, mac_app):
    monkeypatch.setattr(updater.os, "access", lambda path, mode: False)
    with pytest.raises(RuntimeError, match="Place-le dans Applications"):
        updater.install_macos(MAC_UPDATE)
    assert mac_app.launched == []


def test_install_macos_launches_replacement_script(mac_app):
    updater.install_macos(MAC_UPDATE)
    args, kwargs = mac_app.launched[0]
    assert args[0] == "/bin/sh"
    script = open(args[1], encoding="utf-8").read()
    assert f"while kill -0 {os.getpid()}" in script           # attend la fermeture de l'app
    assert "sleep 0.2" in script                              # sondage rapide, pas de délai fixe d'une seconde
    assert f'mv "{mac_app.app}"' in script                     # met l'ancienne version de côté
    assert f'open "{mac_app.app}"' in script                   # relance l'app
    assert f'rm -rf "{mac_app.work}"' in script                # nettoie les fichiers temporaires
    assert kwargs["start_new_session"] is True


def test_install_macos_restores_previous_app_when_copy_fails(mac_app):
    updater.install_macos(MAC_UPDATE)
    script = open(mac_app.launched[0][0][1], encoding="utf-8").read()
    # En cas d'échec de la copie, l'ancienne version est remise en place
    assert f'mv "{mac_app.work / "previous.app"}" "{mac_app.app}"' in script
    assert f'ditto "{mac_app.staged}" "{mac_app.app}"' in script  # copie de la nouvelle version
