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
