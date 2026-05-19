# 🚀 JARVINIS Alexa Server - Guia de Reinicialização

Este documento detalha o passo a passo exato para religar o **JARVINIS** (sua integração local da Alexa com o Ollama) caso o seu computador seja reiniciado ou os terminais sejam fechados acidentalmente.

---

## 🛠️ Pré-requisitos
Antes de iniciar os terminais, certifique-se de que o **Ollama** está rodando no seu Mac. 
- Procure pelo aplicativo **Ollama** no Launchpad ou Spotlight e abra-o. Você deve ver o ícone dele na barra de menus (no topo da tela).
- *Isso garante que o "cérebro" do JARVINIS está ativo na porta 11434.*

---

## Passo 1: Iniciar o Servidor Node.js
O servidor Node.js é a ponte que recebe as requisições da Alexa e as envia para o Ollama.

1. Abra o **Terminal** (ou iTerm).
2. Navegue até a pasta do projeto executando o comando:
   ```bash
   cd /Users/ovinileme/Documents/Repo/Personal/antigravity-qa-agent
   ```
3. Inicie o servidor da Alexa:
   ```bash
   node alexa-server.js
   ```
4. Você deverá ver as seguintes mensagens indicando sucesso:
   > 🚀 Servidor da Alexa rodando na porta 3001  
   > Aguardando o túnel do Ngrok...

---

## Passo 2: Iniciar o Túnel Ngrok
Como a Alexa (na nuvem da Amazon) precisa se comunicar com o seu servidor local (na sua máquina), usamos o Ngrok para criar um link público seguro apontando para o seu servidor.

1. Abra uma **NOVA ABA** ou uma **NOVA JANELA** no Terminal (pressione `Cmd + T` ou `Cmd + N`).
2. Digite o seguinte comando para abrir a porta 3001:
   ```bash
   ngrok http 3001
   ```
3. A tela do Ngrok vai aparecer. Procure pela linha que diz **Forwarding** e copie a URL que começa com `https://` (exemplo: `https://abcd-12-34-56-78.ngrok-free.app`).
   *Nota: Nunca copie a versão `http://`, sempre copie a `https://`.*

---

## Passo 3: Atualizar o Alexa Developer Console
O link do Ngrok muda toda vez que você o reinicia (a menos que você tenha um domínio fixo pago). Por isso, você precisa avisar a Amazon qual é o seu link atual.

1. Acesse o [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Entre na sua Skill do JARVINIS.
3. No menu lateral esquerdo, clique em **Build** e depois role para baixo e clique em **Endpoint**.
4. Na seção **HTTPS**, cole o seu novo link do Ngrok (aquele que você copiou no Passo 2) no campo `Default Region`.
5. Logo abaixo do campo de URL, certifique-se de que a opção de certificado SSL (SSL certificate type) está marcada como:  
   **"My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority"**.
6. Clique no botão **Save Endpoints** (no topo da página).
7. Clique em **Build Skill** (pode levar alguns segundos).

---

## ✅ Pronto!
Seu JARVINIS está online novamente. Basta dizer para a sua Echo Dot:
**"Alexa, abra o Jarvinis"** e fazer a sua pergunta!

---

## 🆘 Dicas de Solução de Problemas (Troubleshooting)
- **Erro de Timeout na Alexa:** Se a Alexa disser "Desculpe, ocorreu um erro", verifique se o Ngrok está rodando e se a URL no painel da Alexa foi atualizada corretamente.
- **Servidor crashou (Erro EADDRINUSE):** Se tentar rodar `node alexa-server.js` e der erro dizendo que a porta 3001 já está em uso, algum processo zumbi ficou preso. Reinicie a máquina ou mate o processo na porta 3001.
- **Jarvinis não sabe responder algo específico:** Lembre-se que o modelo `jarvinis` foi configurado para ser super direto (2 ou 3 frases no máximo) de acordo com o `Modelfile`. Se quiser atualizar a personalidade dele futuramente, edite o arquivo `Modelfile` e rode `ollama create jarvinis -f Modelfile`.
