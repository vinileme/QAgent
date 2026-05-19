#!/usr/bin/env bash
# Instala início automático no login do Mac (LaunchAgent).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.jarvinis.webui.plist"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jarvinis.webui</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/scripts/start-background.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${ROOT}/.jarvinis/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/.jarvinis/logs/launchd.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✅ Autostart instalado: $PLIST"
echo "   No login do Mac, sobe Ollama + Open WebUI (porta 3000)."
echo "   Remover: launchctl unload $PLIST && rm $PLIST"
