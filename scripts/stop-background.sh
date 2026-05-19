#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🛑 Parando Open WebUI..."
docker compose down 2>/dev/null || docker stop jarvinis-open-webui 2>/dev/null || true
echo "✅ Open WebUI parado. (Ollama continua no Mac — feche o app se quiser.)"
