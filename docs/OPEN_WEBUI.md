# Open WebUI / Celular

Guia rápido. Configuração completa: [SETUP.md](./SETUP.md).

## Variável obrigatória

```bash
# No .env do projeto JARVINIS
JARVINIS_ROOT=/Users/SEU_USUARIO/Documents/Repo/Personal/antigravity-qa-agent
```

O Open WebUI precisa conseguir executar `node` nesse caminho.

## Chat multi-turno

```bash
node $JARVINIS_ROOT/chat.js --json --session "{{user_id}}" "{{prompt}}"
```

- Sessão: `~/.jarvinis/sessions/chat-<user_id>.json`
- Reset: `node chat.js --session ID --reset`

Scripts prontos: `config/open-webui/jarvinis-chat.pipe.sh`

## Agente QA com sessão

```bash
# 1ª mensagem (caminho do repositório)
node $JARVINIS_ROOT/qa-agent.js --json --session "{{user_id}}" --autonomous "{{prompt}}"

# Demais mensagens
node $JARVINIS_ROOT/qa-agent.js --json --session "{{user_id}}" "{{prompt}}"
```

Script: `config/open-webui/jarvinis-qa.pipe.sh`

## Celular

1. Mac com Ollama + Open WebUI rodando.
2. Celular na mesma Wi‑Fi → `http://<IP-do-Mac>:3000`.
3. Use o modelo/função configurada com o pipe acima.

Offline de verdade (sem rede local): app **Ollama** no celular (quando disponível) ou VPN (**Tailscale**) até o Mac.

## Testar o pipe localmente

```bash
export JARVINIS_ROOT=$(pwd)
user_id=vini prompt="O que é TDD?" bash config/open-webui/jarvinis-chat.pipe.sh
```
