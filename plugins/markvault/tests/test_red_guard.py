"""Tests for markvault's anti-network-leak barrier (red_guard).

Covers the two refs this task must materialize:

- R4.S2: with the barrier active, an attempt to open a network connection
  aborts the run with a non-zero exit code and a message identifying the
  network block.
- R4.S3: after activating the barrier, the three offline-mode environment
  variables for model libraries equal "1".

R4.S2 is exercised in a subprocess: red_guard's block is implemented as an
uncaught exception, so the only way to observe "the run aborts with a
non-zero exit code" (as opposed to merely "raises an exception") is to run
a real Python process and inspect its exit code and stderr, the same way
an operator running a script under the barrier would observe it.

See plugins/markvault/PDF_EXTRACCION_Y_ANONIMIZACION.md section 3 for the
architecture this module implements.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import unittest
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(_SCRIPTS_DIR))

from markvault import red_guard  # noqa: E402

_OFFLINE_ENV_VARS = ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE")


class TestNetworkConnectionAbortsRun(unittest.TestCase):
    """R4.S2 -- opening a network connection with the barrier active."""

    def test_create_connection_aborts_subprocess_with_nonzero_exit_and_block_message(
        self,
    ) -> None:
        script = (
            "import sys\n"
            f"sys.path.insert(0, {str(_SCRIPTS_DIR)!r})\n"
            "from markvault import red_guard\n"
            "red_guard.activate()\n"
            "import socket\n"
            "socket.create_connection(('192.0.2.1', 80), timeout=1)\n"
        )

        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=15,
        )

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn(red_guard.NETWORK_BLOCK_MESSAGE, proc.stderr)

    def test_socket_connect_aborts_subprocess_with_nonzero_exit_and_block_message(
        self,
    ) -> None:
        script = (
            "import sys\n"
            f"sys.path.insert(0, {str(_SCRIPTS_DIR)!r})\n"
            "from markvault import red_guard\n"
            "red_guard.activate()\n"
            "import socket\n"
            "s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n"
            "s.connect(('192.0.2.1', 80))\n"
        )

        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=15,
        )

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn(red_guard.NETWORK_BLOCK_MESSAGE, proc.stderr)


class TestOfflineEnvVarsForced(unittest.TestCase):
    """R4.S3 -- activating the barrier forces the offline-mode env vars."""

    def setUp(self) -> None:
        self._saved_env = {var: os.environ.get(var) for var in _OFFLINE_ENV_VARS}
        self._saved_activated = red_guard.is_active()
        self._saved_connect = socket.socket.connect
        self._saved_connect_ex = socket.socket.connect_ex
        self._saved_create_connection = socket.create_connection
        for var in _OFFLINE_ENV_VARS:
            os.environ.pop(var, None)
        self.addCleanup(self._restore)

    def _restore(self) -> None:
        for var, value in self._saved_env.items():
            if value is None:
                os.environ.pop(var, None)
            else:
                os.environ[var] = value
        red_guard._activated = self._saved_activated
        socket.socket.connect = self._saved_connect
        socket.socket.connect_ex = self._saved_connect_ex
        socket.create_connection = self._saved_create_connection

    def test_activate_sets_all_three_offline_env_vars_to_one(self) -> None:
        red_guard.activate()

        for var in _OFFLINE_ENV_VARS:
            self.assertEqual(os.environ.get(var), "1")


class TestActivateIsIdempotent(unittest.TestCase):
    """Activation must be idempotent: calling it twice must not double-patch
    or error, and must have the same effect as calling it once."""

    def setUp(self) -> None:
        self._saved_activated = red_guard.is_active()
        self._saved_connect = socket.socket.connect
        self._saved_connect_ex = socket.socket.connect_ex
        self._saved_create_connection = socket.create_connection
        self.addCleanup(self._restore)

    def _restore(self) -> None:
        red_guard._activated = self._saved_activated
        socket.socket.connect = self._saved_connect
        socket.socket.connect_ex = self._saved_connect_ex
        socket.create_connection = self._saved_create_connection

    def test_calling_activate_twice_does_not_double_patch_or_error(self) -> None:
        red_guard.activate()
        patched_connect = socket.socket.connect
        patched_connect_ex = socket.socket.connect_ex
        patched_create_connection = socket.create_connection

        red_guard.activate()  # must not raise, must not re-wrap

        self.assertIs(socket.socket.connect, patched_connect)
        self.assertIs(socket.socket.connect_ex, patched_connect_ex)
        self.assertIs(socket.create_connection, patched_create_connection)


if __name__ == "__main__":
    unittest.main()
