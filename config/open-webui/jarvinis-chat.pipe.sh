#!/usr/bin/env bash
# Pipe Open WebUI — Frente 1 (Chat multi-turno)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JARVINIS_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Node carrega .env via dotenv — não use source aqui (paths com espaços quebram)
export JARVINIS_ROOT

SESSION_ID="${user_id:-${USER_ID:-default}}"
PROMPT_TEXT="${prompt:-${PROMPT:-}}"

if [[ -z "${PROMPT_TEXT}" ]]; then
  echo '{"error":"prompt vazio"}' >&2
  exit 1
fi

exec node "${JARVINIS_ROOT}/chat.js" --json --session "${SESSION_ID}" "${PROMPT_TEXT}"
