#!/bin/zsh
# Çift tıkla: AI Kadrom'u başlatır. (İlk seferde paketleri bu klasöre kurar.)
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-fund --no-audit
nohup npx electron . >/dev/null 2>&1 &
disown
exit 0
