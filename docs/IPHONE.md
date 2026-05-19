# iPhone + app JARVINIS

## 1. Subir o servidor (Mac)

```bash
source ~/.zshrc
jarvinis bg
```

Ou: `npm run start:bg`

Espere ver **http://localhost:3000** e o IP do iPhone (ex.: `http://192.168.1.10:3000`).

## 2. App JARVINIS no Mac

Clique em **Reload JARVINIS** — ele conecta em `localhost:3000` (Open WebUI).

## 3. iPhone (mesma Wi‑Fi)

1. No Mac, anote o IP que o script mostrou.
2. No Safari do iPhone: `http://IP-DO-MAC:3000`
3. **Adicionar à Tela de Início** (funciona como app).

## 4. Modelo

No Open WebUI, selecione **jarvinis** (ou outro modelo Ollama).

## 5. Autostart no login do Mac (opcional)

```bash
./scripts/install-autostart.sh
```

## Parar

```bash
jarvinis stop
```
