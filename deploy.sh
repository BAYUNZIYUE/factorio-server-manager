#!/bin/bash
set -e
cd /workspace/projects/factorio-server-manager
echo "→ 构建前端..."
npm run build
echo "→ 构建后端..."
cd src && /root/.local/go/bin/go build -o factorio-server-manager . && cd ..
echo "→ 停止旧进程..."
kill -9 $(ps aux | awk '/[f]actorio-server-manager/ {print $2}') 2>/dev/null || true
sleep 1
echo "→ 部署文件..."
cp src/factorio-server-manager /home/game/fsm/factorio-server-manager
cp app/bundle.js /home/game/fsm/app/bundle.js
echo "→ 启动服务..."
cd /home/game/fsm && setsid -f ./factorio-server-manager --dir /home/game/fsm --host 0.0.0.0 --port 4094 > fsm.log 2>&1 < /dev/null
sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4094/)
echo "→ HTTP $CODE"
[ "$CODE" = "200" ] && echo "✅ 部署成功" || echo "❌ 部署失败"
