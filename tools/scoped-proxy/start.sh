#!/usr/bin/env bash
# macOS / Linux launcher
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python3.11}
command -v "$PY" >/dev/null || PY=python3
[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt
exec .venv/bin/python -m scoped_proxy
