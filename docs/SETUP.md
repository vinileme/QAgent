# JARVINIS — Guia completo de configuração

## 1. Setup rápido (primeira vez)

```bash
cd /caminho/antigravity-qa-agent
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Ou manualmente:

```bash
cp .env.example .env
# Edite .env (OBSIDIAN_VAULT_PATH, JARVINIS_ROOT)
npm install
npm run check:env
```

## 2. Ollama e modelos

1. Instale e abra o [Ollama](https://ollama.com).
2. Crie o modelo de chat:

```bash
ollama create jarvinis -f Modelfile
```

3. Modelos para o agente QA (opcional, conforme seu hardware):

```bash
ollama pull deepseek-r1:14b
ollama pull qwen2.5-coder:14b
```

4. Valide:

```bash
npm run check:env
```

## 3. Frente 1 — Chat local (PC)

```bash
npm run start:chat
```

Uma pergunta direta:

```bash
node chat.js "O que é test pyramid?"
```

## 4. Frente 1 — Open WebUI (PC / celular na mesma rede)

### 4.1 Instalar Open WebUI

Siga a documentação oficial: [Open WebUI](https://github.com/open-webui/open-webui).

### 4.2 Pipe / função externa (chat multi-turno)

Em **Workspace → Functions** (ou Pipelines), crie uma função que execute:

```bash
node {{JARVINIS_ROOT}}/chat.js --json --session "{{user_id}}" "{{prompt}}"
```

Substitua `{{JARVINIS_ROOT}}` pelo caminho absoluto do `.env` (ex.: `/Users/vini/Documents/Repo/Personal/antigravity-qa-agent`).

Arquivo de referência: `config/open-webui/jarvinis-chat.pipe.sh`

### 4.3 Celular

- **Opção A:** App Ollama (se disponível) apontando para o Mac na rede local.
- **Opção B:** Open WebUI no navegador do celular (`http://IP-DO-MAC:3000`) com o pipe acima.
- **Opção C:** Tailscale para acessar o Mac de fora de casa sem expor portas.

### 4.4 Reiniciar conversa

```bash
node chat.js --session "USER_ID" --reset
```

## 5. Frente 2 — Agente QA

### 5.1 Interativo (terminal)

```bash
npm run start:qa
```

Cole o caminho do repositório alvo quando solicitado.

### 5.2 Autônomo (menos prompts)

```bash
node qa-agent.js --autonomous "/caminho/do/projeto"
```

### 5.3 Open WebUI / headless com sessão

```bash
# Início
node qa-agent.js --json --session qa-projeto --autonomous "/path/repo"

# Continuar (aprovar plano, etc.)
node qa-agent.js --json --session qa-projeto "sim"
```

Pipe de referência: `config/open-webui/jarvinis-qa.pipe.sh`

## 6. qa_sandbox (bootstrap automático)

Ao escanear um projeto ou gravar um teste, o sistema:

1. Detecta **Jest**, **Vitest** ou **Playwright** no `package.json` do alvo.
2. Cria `qa_sandbox/` com `package.json`, config do runner e `README.md`.
3. Roda `npm install` na sandbox antes do primeiro `[EXECUTE_TEST]`.
4. Sugere `[EXECUTE_TEST] npm test` ao modelo.

Variáveis no `.env`:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `QA_SANDBOX_AUTO_BOOTSTRAP` | `true` | Cria estrutura da sandbox |
| `QA_SANDBOX_AUTO_INSTALL` | `true` | `npm install` na sandbox |
| `QA_SANDBOX_INSTALL_TIMEOUT` | `120000` | Timeout em ms |
| `QA_SANDBOX_DEFAULT_RUNNER` | `jest` | Fallback sem package.json |
| `QA_SANDBOX_PLAYWRIGHT_INSTALL` | `false` | `playwright install chromium` |

Testes gerados devem importar o código alvo com caminhos relativos, ex.:

```javascript
import { minhaFn } from "../src/minhaFn.js";
```

## 7. Frente voz — Alexa

Ver [README.md](../README.md) (Ngrok + Developer Console).

```bash
npm run start:alexa
```

## 8. Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `npm run start:chat` | Chat interativo |
| `npm run start:qa` | Agente QA |
| `npm run start:alexa` | Servidor Alexa |
| `npm run check:env` | Valida .env + Ollama |
| `npm test` | Testes unitários |
| `node index.js` | Roteador (chat padrão) |
| `node index.js qa` | Atalho para QA |

## 9. Solução de problemas

| Problema | Ação |
|----------|------|
| `Modelo não encontrado` | `ollama pull` ou ajuste nomes no `.env` |
| `Ollama inacessível` | Abra o app Ollama; confira `OLLAMA_HOST` |
| `EXECUTE_TEST` falha | Veja `qa_sandbox/README.md`; rode `cd qa_sandbox && npm test` manualmente |
| Open WebUI sem resposta | Use caminho absoluto em `JARVINIS_ROOT`; teste o comando no terminal |
| Vault vazio | Configure `OBSIDIAN_VAULT_PATH` |

Sessões salvas em: `~/.jarvinis/sessions/`
