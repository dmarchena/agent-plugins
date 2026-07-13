"""Anti-network-leak barrier for markvault extraction scripts.

Closes "Channel B" described in
plugins/markvault/PDF_EXTRACCION_Y_ANONIMIZACION.md section 3: the
extraction pipeline must never open a network connection, by construction.

`activate()` patches `socket.socket.connect`, `socket.socket.connect_ex`
and `socket.create_connection` so any attempt to open a network connection
fails closed: it raises an uncaught `RuntimeError` carrying
`NETWORK_BLOCK_MESSAGE`, which aborts the running process with a non-zero
exit code and prints that message (via the traceback) to stderr.

It also forces the offline-mode environment variables so HuggingFace /
Transformers libraries never attempt to download models at runtime.

Usage (must run before importing anything that could open a connection,
e.g. NLP libraries):

    import red_guard
    red_guard.activate()

Activation is idempotent: calling `activate()` more than once has the same
effect as calling it once and never double-patches `socket`.
"""
from __future__ import annotations

import os
import socket
from typing import Any

#: Exact, greppable message identifying a network block by this barrier.
#: Pinned by R4.S2 -- any caller/log grepping for "network" + "blocked"
#: will match this string.
NETWORK_BLOCK_MESSAGE = "red_guard: network connection blocked (offline mode enforced)"

#: Environment variables forced to offline mode by R4.S3.
OFFLINE_ENV_VARS = ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE")

_activated = False


def _blocked(*_args: Any, **_kwargs: Any) -> Any:
    """Replacement for socket connect-like methods: always fails closed."""
    raise RuntimeError(NETWORK_BLOCK_MESSAGE)


def activate() -> None:
    """Activate the anti-network-leak barrier.

    Patches `socket.socket.connect`, `socket.socket.connect_ex` and
    `socket.create_connection` to fail closed, and forces the offline-mode
    environment variables in `OFFLINE_ENV_VARS` to "1".

    Idempotent: a second call is a no-op with respect to patching (it does
    not wrap the already-patched functions again), but still re-asserts
    the offline env vars.
    """
    global _activated

    for var in OFFLINE_ENV_VARS:
        os.environ[var] = "1"

    if _activated:
        return

    socket.socket.connect = _blocked
    socket.socket.connect_ex = _blocked
    socket.create_connection = _blocked

    _activated = True


def is_active() -> bool:
    """Return True if the barrier has been activated in this process."""
    return _activated
