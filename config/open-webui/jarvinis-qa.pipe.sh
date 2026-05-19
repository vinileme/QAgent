#!/usr/bin/env bash
# Pipe Open WebUI — Frente 2 (Agente QA com sessão)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JARVINIS_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export JARVINIS_ROOT

SESSION_ID="${user_id:-${USER_ID:-qa-default}}"
PROMPT_TEXT="${prompt:-${PROMPT:-}}"

if [[ -z "${PROMPT_TEXT}" ]]; then
  echo '{"error":"prompt vazio"}' >&2
  exit 1
fi

ARGS=(--json --session "${SESSION_ID}")

if [[ "${JARVINIS_QA_AUTONOMOUS:-}" == "1" ]] || [[ "${autonomous:-}" == "1" ]]; then
  ARGS+=(--autonomous)
fi

exec node "${JARVINIS_ROOT}/qa-agent.js" "${ARGS[@]}" "${PROMPT_TEXT}"
