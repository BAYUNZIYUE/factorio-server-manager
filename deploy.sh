#!/bin/bash
set -e
cd /workspace/projects/factorio-server-manager
echo "→ 构建前端..."
npm run build
echo "→ 构建后端..."
(cd src && /root/.local/go/bin/go build -o factorio-server-manager .)

# Find hashed bundle filename
BUNDLE=$(ls app/bundle.*.js 2>/dev/null | head -1)
if [ -z "$BUNDLE" ]; then
    BUNDLE=app/bundle.js
fi
BUNDLE_NAME=$(basename "$BUNDLE")

echo "→ Bundle: $BUNDLE_NAME"

# Update source index.html with hashed bundle reference
if [ "$BUNDLE_NAME" != "bundle.js" ]; then
    sed -i "s|/bundle\.[a-z0-9]*\.js|/$BUNDLE_NAME|g" app/index.html
    sed -i "s|/bundle\.js|/$BUNDLE_NAME|g" app/index.html
fi

echo "→ 停止旧进程..."
kill -9 $(ps aux | awk '/[f]actorio-server-manager/ {print $2}') 2>/dev/null || true
sleep 1
echo "→ 部署文件..."
cp src/factorio-server-manager /home/game/fsm/factorio-server-manager
cp "$BUNDLE" "/home/game/fsm/app/$BUNDLE_NAME"
cp app/index.html /home/game/fsm/app/index.html
cp app/style.css /home/game/fsm/app/style.css
# Clean old bundle files
rm -f /home/game/fsm/app/bundle.*.js
cp "$BUNDLE" "/home/game/fsm/app/$BUNDLE_NAME"
echo "→ 启动服务..."
cd /home/game/fsm && setsid -f ./factorio-server-manager --dir /home/game/fsm --host 0.0.0.0 --port 4094 > fsm.log 2>&1 < /dev/null
sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4094/)
echo "→ HTTP $CODE"
[ "$CODE" = "200" ] && echo "✅ 部署成功" || echo "❌ 部署失败"
