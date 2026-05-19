#!/usr/bin/env bash
# Sobe Ollama + Open WebUI em background (porta 3000).
# Uso: ./scripts/start-background.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/.jarvinis/logs"
mkdir -p "$LOG_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 JARVINIS — iniciando serviços em background${NC}\n"

# 1) Ollama
if ! curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
  echo "🦙 Abrindo Ollama..."
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Ollama 2>/dev/null || true
  fi
  for i in {1..30}; do
    if curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

if curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
  echo -e "${GREEN}✅ Ollama online (porta 11434)${NC}"
else
  echo -e "${RED}❌ Ollama não responde. Abra o app Ollama manualmente e rode este script de novo.${NC}"
  exit 1
fi

# 2) Open WebUI (Docker)
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker não instalado. Instale Docker Desktop: https://www.docker.com/products/docker-desktop/${NC}"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "🐳 Docker parado — abrindo Docker Desktop..."
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker 2>/dev/null || open -a "Docker Desktop" 2>/dev/null || true
  fi
  for i in {1..90}; do
    if docker info >/dev/null 2>&1; then
      echo -e "${GREEN}✅ Docker pronto${NC}"
      break
    fi
    sleep 2
  done
fi

if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker não está rodando. Abra o Docker Desktop manualmente e rode:${NC}"
  echo "     jarvinis bg"
  exit 1
fi

if curl -sf "http://localhost:3000" >/dev/null 2>&1; then
  echo -e "${GREEN}✅ Open WebUI já responde em http://localhost:3000${NC}"
elif docker ps --format '{{.Names}}' | grep -q '^jarvinis-open-webui$'; then
  echo -e "${GREEN}✅ Container jarvinis-open-webui já está ativo${NC}"
else
  echo "🌐 Subindo Open WebUI na porta 3000..."
  if docker compose up -d 2>&1 | tee -a "$LOG_DIR/docker.log"; then
    echo -e "${GREEN}✅ Open WebUI iniciado${NC}"
  else
    if curl -sf "http://localhost:3000" >/dev/null 2>&1; then
      echo -e "${GREEN}✅ Porta 3000 já em uso por outro Open WebUI — OK para usar${NC}"
    else
      echo -e "${RED}❌ Falha ao subir Docker. Veja: docker logs jarvinis-open-webui${NC}"
      exit 1
    fi
  fi
fi

# Limpa container órfão se outro serviço já usa a porta 3000
if curl -sf "http://localhost:3000" >/dev/null 2>&1; then
  docker rm -f jarvinis-open-webui >/dev/null 2>&1 || true
fi

# Aguarda HTTP
for i in {1..40}; do
  if curl -sf "http://localhost:3000" >/dev/null 2>&1 || curl -sf "http://localhost:3000/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 3) URLs
LAN_IP=""
if [[ "$(uname)" == "Darwin" ]]; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Pronto! Use no Mac ou iPhone (mesma Wi‑Fi)${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Mac / app JARVINIS:  http://localhost:3000"
if [[ -n "$LAN_IP" ]]; then
  echo "  iPhone (Safari):     http://${LAN_IP}:3000"
fi
echo ""
echo "  No Open WebUI, escolha o modelo: jarvinis"
echo "  (ou deepseek-r1:14b / qwen2.5-coder:14b)"
echo ""
echo "  Parar tudo:  ./scripts/stop-background.sh"
echo "  Ver logs:    docker logs -f jarvinis-open-webui"
echo ""
