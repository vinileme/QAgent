#!/usr/bin/env bash
# Atalho global — adicione ao ~/.zshrc:
#   alias jarvinis='source /Users/ovinileme/Documents/Repo/Personal/antigravity-qa-agent/scripts/jarvinis.sh'
#
# Uso:
#   jarvinis chat
#   jarvinis qa
#   jarvinis check
#   jarvinis alexa

JARVINIS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$JARVINIS_ROOT"

# .env é lido pelo Node (dotenv); evite source por causa de paths com espaços
export JARVINIS_ROOT

cmd="${1:-help}"
shift || true

case "$cmd" in
  chat)   exec node chat.js "$@" ;;
  qa)     exec node qa-agent.js "$@" ;;
  alexa)  exec node alexa-server.js "$@" ;;
  check)  exec node scripts/check-env.js ;;
  setup)  exec bash scripts/setup.sh ;;
  bg)     exec bash scripts/start-background.sh ;;
  stop)   exec bash scripts/stop-background.sh ;;
  test)   exec npm test ;;
  help|*)
    echo "JARVINIS — comandos:"
    echo "  jarvinis chat          Chat interativo"
    echo "  jarvinis qa            Agente QA"
    echo "  jarvinis alexa         Servidor Alexa"
    echo "  jarvinis check         Validar ambiente"
    echo "  jarvinis bg            Open WebUI + Ollama (porta 3000)"
    echo "  jarvinis stop          Parar Open WebUI"
    echo "  jarvinis setup         Reconfigurar"
    echo "  jarvinis test          Rodar testes"
    ;;
esac
