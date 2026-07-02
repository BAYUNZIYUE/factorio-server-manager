# FSM Roadmap

## ✅ Done

- [x] Fix mod folder cleanup on Docker volume
- [x] Fix save file parsing for Factorio 2.0
- [x] Read all mods with exact versions directly from save file
- [x] New endpoint to read mods from save without downloading
- [x] Selective mod sync with checkboxes (select/deselect all)
- [x] Real-time download progress via WebSocket
- [x] DLC mods auto-detected and grouped in UI with single toggle
- [x] DLC mods visible in installed mods list with enable/disable
- [x] Server start blocked while mod sync is in progress
- [x] i18n support (EN/RU/zh-CN)
- [x] Token-based authentication on factorio.com
- [x] Server version manager (download/update/downgrade Factorio from UI)
- [x] 5-thread concurrent mod downloading with progress bars
- [x] Upload mod multi-file support
- [x] Mod portal list caching (1 hour)
- [x] Factorio 2.1 compatibility (GEC version checking)
- [x] Factorio 2.0 save header parser (readFromV2)
- [x] Server settings Chinese descriptions (Factorio Wiki based)
- [x] Auth gate preventing login form flash
- [x] 401 auto-redirect to login page

## 📂 Worktree 隔离开发

```
主目录:    /workspace/projects/factorio-server-manager-joey       (当前功能)
参考目录:  /workspace/projects/factorio-server-manager-develop    (joey/develop)

新功能:
  git worktree add ../factorio-server-manager-<slug> -b feat/<slug>
  cd ../factorio-server-manager-<slug>
  # 开发、构建、测试...
  # 完成后: git push && git worktree remove ../factorio-server-manager-<slug>
```

## 🧪 测试流程（每次改动必做）

修改代码后，必须闭环验证以下步骤：

1. **构建**: `npm run build && go build`
2. **部署**: `cp -r app/* /home/game/fsm/app/ && cp factorio-server-manager /home/game/fsm/`
3. **重启**: `kill $(pgrep factorio-server); cd /home/game/fsm && setsid ./factorio-server-manager ...`
4. **登录**: Playwright 打开 `/login` → 输入凭据 → 确认跳转到主页
5. **功能页**: 导航到改动的页面，等待 15 秒
6. **检查**: 控制台 0 个 JS Error，页面正常渲染
7. **交互**: 点击/拖拽核心功能，确认不崩溃

> 每次提交前跑一遍，不允许「改完就提交」。

## 🚧 Planned

### Mods
- [ ] Auto-resolve mod dependencies when creating a new save
- [ ] Portal link icon next to each mod in the list
- [ ] Row highlight on hover in mod list
- [ ] Batch update all compatible mods for current server version

### Authentication
- [ ] Show logged-in username on mod portal tab
- [ ] Refresh button for saved credentials
- [ ] Proper FSM login (registration form on first launch)

### Server
- [ ] Controls page info panel — merge Game Settings into Controls dashboard:
  - Remove standalone `/game-settings` page (mostly empty config.ini view)
  - Add read-only info section below start/stop controls:
    - Factorio version + base mod version
    - Data paths (read-data / write-data)
    - Installed / compatible / incompatible mod counts
    - Save file count + last modified
    - (future) uptime, player count
- [ ] Server Status tab refactor:
  - Autostart checkbox
  - Factorio version dropdown with auto-download
  - Server name field
- [ ] Multi-server support
- [ ] Dual logs — Factorio server logs + FSM manager logs
