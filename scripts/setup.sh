#!/usr/bin/env bash
# Setup inicial do JARVINIS
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🚀 JARVINIS — Setup"
echo "   Diretório: $ROOT"
echo ""

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "✅ .env criado a partir de .env.example"
  echo "   Edite OBSIDIAN_VAULT_PATH e JARVINIS_ROOT no .env"
else
  echo "ℹ️  .env já existe"
fi

if ! grep -q "^JARVINIS_ROOT=" .env 2>/dev/null || grep -q "SEU_USUARIO" .env 2>/dev/null; then
  if [[ "$(uname)" == "Darwin" ]]; then
    SED_INPLACE=(-i '')
  else
    SED_INPLACE=(-i)
  fi
  if grep -q "^JARVINIS_ROOT=" .env; then
    sed "${SED_INPLACE[@]}" "s|^JARVINIS_ROOT=.*|JARVINIS_ROOT=$ROOT|" .env
  else
    echo "JARVINIS_ROOT=$ROOT" >> .env
  fi
  echo "✅ JARVINIS_ROOT definido para $ROOT"
fi

echo ""
echo "📦 Instalando dependências npm..."
npm install

echo ""
echo "🦙 Verificando Ollama..."
if command -v ollama >/dev/null 2>&1; then
  ollama list || true
  echo ""
  echo "Modelos sugeridos (se ainda não tiver):"
  echo "  ollama create jarvinis -f Modelfile"
  echo "  ollama pull deepseek-r1:14b"
  echo "  ollama pull qwen2.5-coder:14b"
else
  echo "⚠️  Ollama não está no PATH. Instale: https://ollama.com"
fi

echo ""
npm run check:env || true

echo ""
echo "Próximos passos:"
echo "  npm run start:chat    # Chat local"
echo "  npm run start:qa      # Agente QA"
echo "  npm run start:alexa   # Alexa (opcional)"
echo ""
echo "Documentação: docs/SETUP.md"
echo ""
