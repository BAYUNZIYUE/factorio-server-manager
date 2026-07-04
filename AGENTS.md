# Factorio Server Manager — 项目规则

> 本文件优先级高于工作区 AGENTS.md

## 部署规则（最高优先级）

**任何代码改动完成后，必须执行部署脚本，不得跳过。**

```bash
bash /workspace/projects/factorio-server-manager/deploy.sh
```

该脚本会：构建前端 → 构建后端 → 停止旧进程 → 拷贝文件 → 启动服务 → 验证 HTTP 200。

以下情况视为"改动完成"且必须部署：
- 任何 .go 文件变更
- 任何 .jsx / .js / .css 文件变更
- 任何 config / template / 路由 变更
- commit 之后

**例外**：仅修改文档（AGENTS.md、README）无需部署。

## 技术栈

- 后端: Go (gorilla/mux, gorilla/websocket, SQLite via GORM)
- 前端: React 18 + Tailwind CSS 3 + i18next
- 构建: Webpack 5 + Go 1.22

## 构建验证

```bash
# 仅编译验证（不部署）
cd src && /root/.local/go/bin/go build ./...
npm run build
```

## 运行信息

- 运行目录: `/home/game/fsm/`
- 端口: `:4094`
- 启动命令: `cd /home/game/fsm && setsid -f ./factorio-server-manager --dir /home/game/fsm --host 0.0.0.0 --port 4094 > fsm.log 2>&1 < /dev/null`

## i18n 注意事项

项目使用 i18next，但实例相关页面的翻译目前硬编码中文。原因：i18next 命名空间加载存在兼容问题。后续可改为用 common 命名空间统一管理。
