# Changelog

Changes of this fork. History of the original project: [CHANGELOG-upstream.md](CHANGELOG-upstream.md). Detailed items: [ROADMAP.md](ROADMAP.md).

## [6.7.1] - 2026-10-28
### Added
- Native Linux install without Docker: one-line installer/updater (`install.sh`) and `start.sh` (dependency check, first-run setup, port check, update hint)

## [6.7.0] - 2026-10-27
First master release of the fork.

### Added
- Windows build without Docker: `start.bat` / `start.ps1`, `prepare-factorio` (Steam client, client zip or manual path), ready banner with the initial admin password
- Docker setup helper: macvlan question first, host IP/interface/gateway autodetection (`--network host`), docker-compose for Docker Desktop
- Server Factorio version is pinned; stab/exp resolve only on an explicit change
- Help tab: quick start, how-to, danger zone (wipe / delete server, optional backups wipe)
- Sync modes Match save / Add from save
- Translations EN/RU for saves, mods, presets, servers

### Fixed
- Duplicate mod versions in mod-list.json and the permanent Apply diff
- Web port other than 80 in the Docker helper
- F5 white page on nested routes
- "broken pipe" and "record not found" noise in logs

### Changed
- Removed unreachable legacy code

## [6.3 - 6.6]
Multi-server, mod library, save backups, watchdog, version management. See [ROADMAP.md](ROADMAP.md).
