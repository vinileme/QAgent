# Configuração Open WebUI

## Pré-requisito

No Mac/servidor onde roda o Open WebUI, o Node.js e o Ollama devem estar acessíveis. Defina no ambiente do Open WebUI (ou no `.env` do JARVINIS):

```bash
export JARVINIS_ROOT=/caminho/absoluto/antigravity-qa-agent
```

## Chat (Frente 1)

1. Open WebUI → **Admin** → **Functions** (ou **Pipelines**).
2. Crie uma função tipo **shell/command**.
3. Comando (ajuste o caminho):

```bash
node /caminho/antigravity-qa-agent/chat.js --json --session "{{user_id}}" "{{prompt}}"
```

4. Associe a função a um modelo ou use como filtro de resposta.

Saída esperada (JSON):

```json
{ "response": "texto da IA", "session": "id-do-usuario" }
```

## QA (Frente 2)

Primeira mensagem com caminho do repo:

```bash
node /caminho/antigravity-qa-agent/qa-agent.js --json --session "{{user_id}}" --autonomous "{{prompt}}"
```

O `{{prompt}}` deve ser o caminho absoluto do projeto na primeira vez.

Continuação:

```bash
node /caminho/antigravity-qa-agent/qa-agent.js --json --session "{{user_id}}" "{{prompt}}"
```

## Testar no terminal antes do Open WebUI

```bash
export JARVINIS_ROOT=/caminho/antigravity-qa-agent
user_id=teste prompt="Olá" bash config/open-webui/jarvinis-chat.pipe.sh
```

## Celular

Acesse o Open WebUI pelo IP local do Mac (`http://192.168.x.x:3000`) na mesma Wi‑Fi, ou use Tailscale.
