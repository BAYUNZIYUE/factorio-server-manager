# FSM Multi-Instance Support Design Spec

**Date:** 2026-07-02
**Project:** factorio-server-manager
**Branch:** feat/multi-instance
**Status:** Draft / Approved for Implementation

---

## 1. Overview and Goals

### 1.1 Problem

Factorio Server Manager (FSM) currently manages exactly one Factorio game server instance. The Go backend holds a single global `factorio.Server` singleton accessed via `factorio.GetFactorioServer()`, a single global `bootstrap.Config` accessed via `bootstrap.GetConfig()`, and all API handlers operate against this single instance. Server operators who want to run multiple independent Factorio servers (different mod sets, different map saves, different versions, or different game ports) from a central web panel currently have no supported path—they must either run separate FSM processes on different ports or hack directories manually. This spec extends FSM to manage an arbitrary number of fully isolated Factorio server instances from one unified web interface.

### 1.2 Goals

- Allow one FSM web panel to manage multiple independent Factorio server instances.
- Each instance is completely isolated: its own Factorio binary (allowing different versions), saves directory, mods directory, configs, server-settings.json, logs, and game/RCON ports.
- Instance metadata is stored as `instance.json` inside each instance directory—portable, self-describing, and not reliant on the database.
- FSM auto-discovers instances on startup by scanning `instances/` for directories containing `instance.json`.
- Backward-compatible: old single-instance installations auto-migrate to `instances/default/` on first launch.
- All existing UI pages (Controls, Saves, Mods, Console, Logs, Server Settings, Server Version) operate within the context of a selected instance.
- Frontend adds an instance switcher, instance list page, and instance creation wizard.
- WebSocket rooms are scoped per-instance (`instance/{name}/gamelog` etc.) so operators see only the logs and status of the currently selected instance.

### 1.3 Non-Goals

- Per-instance authentication (one unified login manages all instances).
- Cross-instance features: no save transfer, mod sharing, or binary sharing between instances.
- Partial sharing configuration options (no "share mods dir but not saves").
- Container/ orchestration layer (Docker, Kubernetes) integration.
- Load balancing or automatic port allocation beyond collision detection.
- Instance cloning or snapshot/restore.
- Windows support for save-file parsing during instance creation from save (the Factorio download API targets linux64).

---

## 2. Current Architecture (Baseline)

### 2.1 Backend Global Singletons

```
src/
├── factorio/server.go   → var instantiated Server (global singleton, accessed via GetFactorioServer())
├── bootstrap/config.go  → var instantiated Config (global singleton, accessed via GetConfig())
├── api/handlers.go      → every handler calls factorio.GetFactorioServer() directly
├── api/routes.go        → ServerOffMiddleware calls factorio.GetFactorioServer().GetRunning()
└── api/websocket/wshub.go → room-based pub/sub via wsRoom{name, clients, send}
```

The `factorio.Server` struct holds:
- `Cmd *exec.Cmd` — the running Factorio OS process
- `Running bool` — runtime state flag
- `Savefile`, `BindIP`, `Port` — server configuration
- `Version`, `BaseModVersion` — detected versions
- `Rcon *rcon.RemoteConsole` — RCON connection handle
- `StdOut`, `StdErr`, `StdIn` — pipes to the Factorio process
- `Settings map[string]interface{}` — server-settings.json content
- `LogChan chan []string` — log output channel

The `bootstrap.Config` struct holds all paths (`FactorioDir`, `FactorioBinary`, `FactorioSavesDir`, `FactorioModsDir`, `FactorioConfigDir`), ports, flags, and the database file path. These are all single-value fields—no mechanism exists for per-instance paths.

### 2.2 Backend API Pattern

All API routes are registered in the flat `apiRoutes` slice in `routes.go`. Handlers like `StartServer`, `StopServer`, `KillServer`, `ListSaves`, etc. all begin with `var server = factorio.GetFactorioServer()` and operate on the global singleton. Routes are un-namespaced: `/api/server/start`, `/api/server/status`, `/api/saves/list`, `/api/mods/list`, etc.

### 2.3 WebSocket Subscriptions

The `wsHub` (websocket Hub) supports named rooms. Current rooms:
- `gamelog` — real-time Factorio server log lines
- `server_status` — server running/stopped state JSON
- `mod_install` — mod installation progress
- `mods_sync` — mod sync progress
- `mods_events` — mod-related events
- `server_version` — version download progress

No room scoping; all rooms are flat strings shared by all connected clients.

### 2.4 Frontend Architecture

The React app uses plain `useState` for state management, passing `serverStatus` as a prop through the component tree via React Router's `<Outlet />`. The `App.jsx` component fetches status once at login and subscribes to the `server_status` WebSocket room, passing the result down to all child routes:

```jsx
<Route element={<Layout handleLogout={handleLogout} serverStatus={serverStatus} />}>
    <Route index element={<Controls serverStatus={serverStatus} />}/>
    <Route path="saves" element={<Saves serverStatus={serverStatus} />}/>
    ...
</Route>
```

The `socket.js` module uses an `EventEmitter` pattern with a global WebSocket connection. Subscription is room-based: rooms like `gamelog`, `server_status` map to helper functions that send WebSocket control messages.

---

## 3. Proposed Architecture

### 3.1 Directory Layout & Instance Isolation

```
instances/
├── default/                          ← auto-migrated from old root directory
│   ├── instance.json                 ← self-describing metadata
│   ├── bin/x64/factorio              ← per-instance Factorio binary
│   ├── saves/
│   ├── mods/
│   ├── config/
│   │   ├── server-settings.json
│   │   ├── config.ini
│   │   ├── server-adminlist.json
│   │   └── factorio.current.log
│   └── factorio-server-console.log
├── my-other-server/
│   ├── instance.json
│   ├── bin/x64/factorio
│   ├── saves/
│   ├── mods/
│   ├── config/
│   └── ...
└── factorio.auth                     ← global factorio.com credentials (shared by all instances)
```

**Key design decisions:**
- `factorio.auth` remains at the root level (shared credential file for factorio.com mod portal / download API access). All instances share the same credentials.
- Binary isolation: each instance has its own `bin/x64/factorio`. This enables running different Factorio versions per instance.
- Port uniqueness is enforced by the InstanceManager's `ValidatePort()` check across all instances.
- Instance directory names must be valid filesystem directory names, lowercase alphanumeric with hyphens. No spaces or special characters.

### 3.2 Instance Metadata (`instance.json`)

Each instance directory contains a JSON metadata file:

```json
{
  "name": "my-server",
  "display_name": "My Server",
  "factorio_version": "2.1.0",
  "game_port": 34197,
  "rcon_port": 27015,
  "bind_ip": "0.0.0.0",
  "autostart": false,
  "created_at": "2026-07-02T15:00:00Z",
  "updated_at": "2026-07-02T16:00:00Z"
}
```

**Schema notes:**
- `name` must match the directory name. Used for API routing (`/api/instance/{name}/...`).
- `display_name` is the human-readable label shown in the UI. Defaults to `name` if empty.
- `factorio_version` records the Factorio version when this instance was created. Used for display and for deciding whether to offer version updates. Not authoritative—the binary's `--version` output is the source of truth.
- `game_port` is the UDP port the Factorio game server listens on (default `34197`).
- `rcon_port` is the TCP port for RCON admin access. Auto-assigned during creation if omitted.
- `bind_ip` is the bind address for the game server. Defaults to `0.0.0.0`.
- `autostart` controls whether this instance starts automatically when FSM boots.
- `created_at` / `updated_at` are UTC timestamps in ISO 8601 format.

### 3.3 New Package: `src/instance/`

```
src/instance/
├── manager.go       - InstanceManager (holds all instances, thread-safe)
├── instance.go      - Instance struct + lifecycle (Start/Stop/Kill/Status)
├── discovery.go     - Auto-discovery + instance.json read/write
└── repair.go        - Auto-repair missing instance.json
```

#### 3.3.1 InstanceManager (`manager.go`)

```go
package instance

type InstanceManager struct {
    mu        sync.RWMutex
    instances map[string]*Instance
    rootDir   string // path to instances/ directory
}

func NewManager(rootDir string) *InstanceManager
func (m *InstanceManager) Discover() error                    // scan rootDir, load all instances
func (m *InstanceManager) Create(name string, opts CreateOpts) (*Instance, error)
func (m *InstanceManager) Remove(name string) error           // delete directory, force-kill if running
func (m *InstanceManager) Get(name string) (*Instance, bool)
func (m *InstanceManager) List() []*Instance
func (m *InstanceManager) Repair(name string) (*Instance, error) // auto-generate instance.json
func (m *InstanceManager) ValidatePort(port int) error         // check all instances for port conflict
func (m *InstanceManager) ByPort(port int) *Instance           // find instance using a given port
func (m *InstanceManager) StartOperation()                     // acquire serialization lock for start
func (m *InstanceManager) EndOperation()                       // release serialization lock
```

**Thread safety:**
- `instances` map is protected by `sync.RWMutex`.
- Concurrent `Start()` calls are serialized by a separate mutex (`startMu`) to prevent multiple Factorio processes from starting simultaneously (each start is CPU/memory intensive).
- `List()` and `Get()` only need read locks.
- `Create()`, `Remove()`, `Repair()` need write locks.

#### 3.3.2 Instance Struct (`instance.go`)

```go
type InstanceStatus int

const (
    StatusStopped   InstanceStatus = iota
    StatusStarting
    StatusRunning
    StatusStopping
    StatusError
)

type Instance struct {
    metadata InstanceMetadata // loaded from instance.json; persisted back via SaveMetadata()
    server   *factorio.Server // per-instance factorio server controller
    status   InstanceStatus
    statusMu sync.RWMutex
    logFile  string // path to console log file for this instance
}

type InstanceMetadata struct {
    Name            string    `json:"name"`
    DisplayName     string    `json:"display_name,omitempty"`
    FactorioVersion string    `json:"factorio_version,omitempty"`
    GamePort        int       `json:"game_port"`
    RconPort        int       `json:"rcon_port"`
    BindIP          string    `json:"bind_ip"`
    Autostart       bool      `json:"autostart"`
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}

func (inst *Instance) Start() error            // delegates to server.Run()
func (inst *Instance) Stop() error             // delegates to server.Stop()
func (inst *Instance) Kill() error             // delegates to server.Kill()
func (inst *Instance) Status() InstanceStatus
func (inst *Instance) SetStatus(s InstanceStatus)
func (inst *Instance) Server() *factorio.Server
func (inst *Instance) Metadata() InstanceMetadata
func (inst *Instance) Dir() string             // full path to instance directory
func (inst *Instance) SaveMetadata() error     // write instance.json back to disk
```

**Instance status lifecycle:**

```
  Stopped ──Start()──> Starting ──server starts──> Running
     ^                                                  │
     │                                                  │ Stop() / Kill()
     │                                                  v
     └────── server exits ────── Stopping ────> Stopped
                                                      │
                                                      │ error
                                                      v
                                                    Error
```

The `Instance` struct wraps a `*factorio.Server`. Each instance gets its own Server object constructed via a new `factorio.NewServer(path, config)` factory function (see Section 3.4). The Instance is responsible for passing the correct per-instance binary path, saves dir, mods dir, settings file, and port to its Server.

#### 3.3.3 Auto-Discovery (`discovery.go`)

```go
func (m *InstanceManager) Discover() error
```

**Scan algorithm:**
1. Walk all direct subdirectories of `instances/` (the `rootDir`).
2. For each subdirectory:
   a. If `instance.json` exists → parse it, validate fields, load as normal instance.
   b. If `instance.json` exists but content is corrupt or incomplete → flag error, offer repair.
   c. If `instance.json` does NOT exist:
      - Probe directory contents: look for `bin/x64/factorio`, `saves/`, `mods/`, `config/`.
      - If the directory looks like a complete Factorio instance → auto-repair (generate `instance.json` by scanning binary version and port from `config/server-settings.json`).
      - If the directory has minimal or no recognizable Factorio files → skip (user's random directory, not an FSM instance).
3. After discovery, validate that no two instances share the same `game_port` or `rcon_port`.
4. Log any discovered instances with their name, version, and port.

#### 3.3.4 Auto-Repair (`repair.go`)

```go
func (m *InstanceManager) Repair(name string) (*Instance, error)
```

**Repair logic for a directory missing `instance.json`:**
1. Check for binary at `{dir}/bin/x64/factorio` and run `--version` to extract version.
2. Check for `config/server-settings.json` and extract `game_port` from the JSON.
3. Use default bind IP `0.0.0.0`.
4. Auto-assign RCON port (random in 40000-45000 range).
5. Generate `instance.json` with all discovered/synthesized fields.
6. Validate no port conflicts before writing.
7. Write `instance.json` and return the loaded Instance.

**What repair does NOT do:**
- It does not fix partial or corrupt binary files.
- It does not download missing Factorio binaries.
- It does not second-guess the user's save/mods/config structure.

### 3.4 De-globalize `factorio.Server`

#### 3.4.1 New Factory: `factorio.NewServer()`

Currently `NewFactorioServer()` constructs a single global `Server` and stores it in `var instantiated Server`. This must change to a per-instance factory.

```go
// New signature (replaces both NewFactorioServer and the global singleton):
func NewServer(instanceDir string, config ServerConfig) *Server
```

Where `ServerConfig` is a new struct containing per-instance overrides:

```go
type ServerConfig struct {
    InstanceName string // instance name, used for WebSocket room scoping
    BinaryPath   string // path to this instance's bin/x64/factorio
    SavesDir     string // e.g. instances/my-server/saves/
    ModsDir      string // e.g. instances/my-server/mods/
    ConfigDir    string // e.g. instances/my-server/config/
    SettingsFile string // e.g. instances/my-server/config/server-settings.json
    GamePort     int
    RconPort     int
    BindIP       string
    ConsoleLog   string // e.g. instances/my-server/factorio-server-console.log
    CredentialsFile string // global ./factorio.auth
}
```

**What changes:**
- `var instantiated Server` and `once sync.Once` are removed from `server.go`.
- `GetFactorioServer()` is removed entirely. No code calls it anymore.
- `NewFactorioServer()` (capital N) is replaced by `NewServer(dir, config)`. It no longer exists as a global initialization function. The migration path uses the InstanceManager directly (see Section 3.6).
- `SetFactorioServer()` is removed.
- All methods on `*Server` remain unchanged. The struct fields remain the same. Only the singleton pattern is replaced.

#### 3.4.2 Migration Shim

The `main.go` startup changes from:

```go
func main() {
    config := bootstrap.NewConfig(os.Args[1:])
    factorio.ModStartUp()
    err := factorio.NewFactorioServer()  // sets global singleton
    api.SetupAuth()
    router := api.NewRouter()
    ...
}
```

To:

```go
func main() {
    config := bootstrap.NewConfig(os.Args[1:])
    manager := instance.NewManager(config.InstancesDir)
    
    // Migration: if root directory has old-style saves/ etc., migrate to instances/default/
    if needsMigration(config) {
        migrateToMultiInstance(config, manager)
    }
    
    // Discover all instances
    if err := manager.Discover(); err != nil {
        log.Fatalf("Error discovering instances: %v", err)
    }
    
    // Auto-start instances with autostart=true
    for _, inst := range manager.List() {
        if inst.Metadata().Autostart {
            go inst.Start()
        }
    }
    
    factorio.ModStartUp()  // mods infrastructure now instance-scoped
    api.SetupAuth()
    api.SetInstanceManager(manager)  // inject into API layer
    router := api.NewRouter()
    ...
}
```

### 3.5 De-globalize `bootstrap.Config`

The global `bootstrap.GetConfig()` returns a single Config struct with single-value paths (`FactorioDir`, `FactorioBinary`, etc.). For multi-instance, the global Config shrinks to contain only **truly global** settings:

**Fields that stay in global Config:**
- `ServerIP`, `ServerPort` — the FSM web panel listener
- `DatabaseFile`, `CookieEncryptionKey` — global database and auth
- `MaxUploadSize` — upload limit
- `InstancesDir` — new field, path to `instances/` directory (default `"./instances"`)
- `Secure` — TLS setting
- `ConfFile` — config file path
- `GlibcCustom`, `GlibcLocation`, `GlibcLibLoc` — glibc overrides (applied per-instance at binary launch time, stored globally since it's a system-wide setting)

**Fields that move to per-instance `ServerConfig`:**
- `FactorioDir` → `Instance.Dir()`
- `FactorioBinary` → stored in instance paths
- `FactorioSavesDir`, `FactorioModsDir`, `FactorioConfigDir` → derived from instance directory
- `FactorioRconPort` → per-instance from `instance.json`
- `SettingsFile` → `{instanceDir}/config/server-settings.json`
- `ConsoleLogFile` → `{instanceDir}/factorio-server-console.log`
- `Autostart` → per-instance field in `instance.json`
- `FactorioAdminFile` → `{instanceDir}/config/server-adminlist.json`
- `FactorioBaseModDir` → `{instanceDir}/data/base`
- `FactorioLog` → `{instanceDir}/config/factorio-current.log`

The `Flags` struct gets a new `--instances-dir` flag (default `"./instances"`, env `FSM_INSTANCES_DIR`).

### 3.6 Auto-Migration (`migrate.go`)

On first launch after upgrading to the multi-instance version, if the root directory contains old-style Factorio files (`saves/`, `mods/`, `bin/x64/factorio`, `config/server-settings.json`) AND `instances/` does not exist:

1. Create `instances/default/`.
2. Move `saves/` → `instances/default/saves/`.
3. Move `mods/` → `instances/default/mods/`.
4. Move `config/` → `instances/default/config/`.
5. Move `bin/` (if exists) → `instances/default/bin/`.
6. Move `factorio-server-console.log` → `instances/default/factorio-server-console.log`.
7. Move `data/` (if exists) → `instances/default/data/`.
8. Generate `instances/default/instance.json` by scanning the binary version and extracting port from `config/server-settings.json`.
9. Update `conf.json` to set `InstancesDir: "./instances"`.
10. Log all migration steps for operator awareness.

**Safety:**
- If `instances/` already has contents, migration is **skipped entirely**. The old root-level files remain untouched. The operator can manually clean up.
- Migration only runs once. A sentinel file `instances/.migrated` is created after successful migration.
- If any move operation fails, the entire migration is rolled back (moves are logged for manual recovery; full rollback is impractical for moved files, so the operator is alerted to check `instances/default/`).

---

## 4. API Design

### 4.1 Instance Management Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/api/instances` | `ListInstances` | List all instances with summary status |
| `POST` | `/api/instances` | `CreateInstance` | Create new instance (blank or from save) |
| `DELETE` | `/api/instances/{name}` | `DeleteInstance` | Remove instance directory (kill if running) |
| `POST` | `/api/instances/repair` | `RepairInstance` | Auto-repair missing `instance.json` |
| `POST` | `/api/instances/check-port` | `CheckPort` | Port conflict check for a given port |
| `GET` | `/api/instances/{name}` | `GetInstance` | Get instance metadata and status |

### 4.2 Instance Operation Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `POST` | `/api/instance/{name}/start` | `StartInstance` | Start the Factorio server for this instance |
| `POST` | `/api/instance/{name}/stop` | `StopInstance` | Stop gracefully |
| `POST` | `/api/instance/{name}/kill` | `KillInstance` | Kill forcefully |

### 4.3 Instance Status Endpoint

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/api/instance/{name}/status` | `InstanceStatus` | Returns running status, version, settings summary |

**Response:**
```json
{
    "name": "my-server",
    "display_name": "My Server",
    "status": "running",
    "factorio_version": "2.1.0",
    "game_port": 34197,
    "rcon_port": 27015,
    "bind_ip": "0.0.0.0",
    "savefile": "Load Latest",
    "uptime_seconds": 3600,
    "players": ["player1", "player2"]
}
```

### 4.4 Instance-Specific Endpoints (Replace Existing `/api/server/...`)

All operations that were previously global now require the `{name}` path parameter:

| Method | Path | Handler | Replaces |
|--------|------|---------|----------|
| `GET` | `/api/instance/{name}/saves/list` | `ListInstanceSaves` | `/api/saves/list` |
| `GET` | `/api/instance/{name}/saves/dl/{save}` | `DLInstanceSave` | `/api/saves/dl/{save}` |
| `POST` | `/api/instance/{name}/saves/upload` | `UploadInstanceSave` | `/api/saves/upload` |
| `GET` | `/api/instance/{name}/saves/rm/{save}` | `RemoveInstanceSave` | `/api/saves/rm/{save}` |
| `GET` | `/api/instance/{name}/saves/create/{save}` | `CreateInstanceSave` | `/api/saves/create/{save}` |
| `POST` | `/api/instance/{name}/saves/mods` | `LoadModsFromInstanceSave` | `/api/saves/mods` |
| `POST` | `/api/instance/{name}/saves/mods/list` | `GetModsFromInstanceSave` | `/api/saves/mods/list` |
| `POST` | `/api/instance/{name}/saves/mods/sync` | `SyncModsFromInstanceSave` | `/api/saves/mods/sync` |
| `POST` | `/api/instance/{name}/saves/mods/sync/cancel` | `CancelModsFromInstanceSync` | `/api/saves/mods/sync/cancel` |
| `GET` | `/api/instance/{name}/mods/list` | `ListInstanceMods` | `/api/mods/list` |
| `POST` | `/api/instance/{name}/mods/toggle` | `ToggleInstanceMod` | `/api/mods/toggle` |
| `POST` | `/api/instance/{name}/mods/delete` | `DeleteInstanceMod` | `/api/mods/delete` |
| `POST` | `/api/instance/{name}/mods/delete/all` | `DeleteAllInstanceMods` | `/api/mods/delete/all` |
| `POST` | `/api/instance/{name}/mods/update` | `UpdateInstanceMod` | `/api/mods/update` |
| `POST` | `/api/instance/{name}/mods/upload` | `UploadInstanceMod` | `/api/mods/upload` |
| `GET` | `/api/instance/{name}/mods/download` | `DownloadInstanceMods` | `/api/mods/download` |
| `GET` | `/api/instance/{name}/mods/packs/*` | `InstanceModPacksHandler` | `/api/mods/packs/*` |
| `POST` | `/api/instance/{name}/mods/portal/*` | `InstanceModPortalHandler` | `/api/mods/portal/*` |
| `GET` | `/api/instance/{name}/settings` | `GetInstanceSettings` | `/api/settings` |
| `POST` | `/api/instance/{name}/settings/update` | `UpdateInstanceSettings` | `/api/settings/update` |
| `GET` | `/api/instance/{name}/log/tail` | `InstanceLogTail` | `/api/log/tail` |
| `GET` | `/api/instance/{name}/version/current` | `InstanceVersionCurrent` | `/api/server/version/current` |
| `GET` | `/api/instance/{name}/version/available` | `InstanceVersionAvailable` | `/api/server/version/available` |
| `GET` | `/api/instance/{name}/version/list` | `InstanceVersionList` | `/api/server/version/list` |
| `POST` | `/api/instance/{name}/version/install` | `InstanceVersionInstall` | `/api/server/version/install` |
| `GET` | `/api/instance/{name}/version/install-status` | `InstanceVersionInstallStatus` | `/api/server/version/install-status` |
| `GET` | `/api/instance/{name}/config` | `InstanceLoadConfig` | `/api/config` |

### 4.5 Backward-Compatible Legacy Endpoints

The old single-instance endpoints (`/api/server/start`, `/api/saves/list`, etc.) remain functional for backward compatibility. They redirect to the `default` instance:

```go
// Old endpoint: transparently forward to default instance
func StartServer(w http.ResponseWriter, r *http.Request) {
    http.Redirect(w, r, "/api/instance/default/start", http.StatusPermanentRedirect)
}
```

These legacy handlers are implemented as HTTP 308 redirects (Permanent Redirect) to the scoped path. All new frontend code uses scoped paths exclusively. The old paths are deprecated and logged on first use per session.

### 4.6 Middleware: InstanceContext

A new middleware extracts the `{name}` path variable and injects the corresponding Instance into the request context:

```go
func InstanceMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        vars := mux.Vars(r)
        name := vars["name"]
        inst, ok := instanceManager.Get(name)
        if !ok {
            http.Error(w, "instance not found", http.StatusNotFound)
            return
        }
        ctx := context.WithValue(r.Context(), instanceKey, inst)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

All scoped handlers retrieve the instance from context instead of calling `factorio.GetFactorioServer()`:

```go
func ListInstanceSaves(w http.ResponseWriter, r *http.Request) {
    inst := r.Context().Value(instanceKey).(*instance.Instance)
    server := inst.Server()
    // ... existing ListSaves logic using server
}
```

### 4.7 Server Off Middleware (Per-Instance)

The existing `ServerOffMiddleware` checks `factorio.GetFactorioServer().GetRunning()`. For multi-instance, this becomes per-instance. Routes that require the instance server to be off use a new middleware variant:

```go
func InstanceServerOffMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        inst := r.Context().Value(instanceKey).(*instance.Instance)
        if inst.Status() == instance.StatusRunning || inst.Status() == instance.StatusStarting {
            http.Error(w, "factorio server still running for this instance", http.StatusLocked)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### 4.8 Create Instance from Save (Upload Endpoint)

**`POST /api/instances`** with `Content-Type: multipart/form-data`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Instance name (directory name) |
| `display_name` | string | Optional display name |
| `save_file` | file | Factorio save file (.zip) for "from save" creation |
| `factorio_version` | string | Version to use (or omit for auto-detect from save) |

**Processing flow (from save):**
1. Receive the multipart upload.
2. Parse the save file to extract Factorio version and mod list with CRC (using existing logic in `saves.go` / `mod_Mods.go`).
3. Auto-assign ports: check for collisions; assign first available RCON port in 40000-45000 range and game port starting at 34197 + offset.
4. Create instance directory: `instances/{name}/`.
5. If the requested Factorio binary version is not present, download it using existing `factorio/version_manager.go` logic.
6. Initialize directory structure (`saves/`, `mods/`, `config/`).
7. Copy save file into `instances/{name}/saves/`.
8. If mods listed in the save are not in `instances/{name}/mods/`, download mods from mod portal (using existing mod sync logic).
9. Generate `instance.json`.
10. Return the created instance metadata.

The frontend shows step-by-step progress via WebSocket room `instance/{name}/create_progress`.

**For blank creation** (no save file):
1. User selects version from available list or specifies a version manually.
2. Instance directory created.
3. Factorio binary downloaded for the selected version.
4. Default `server-settings.json` copied from binary's `data/server-settings.example.json`.
5. Default `instance.json` generated.
6. Instance returned as ready.

### 4.9 Route Registration

New routes are added to `apiRoutes` in `routes.go`. The scoped routes live under a subrouter at `/api/instance/{name}` with `InstanceMiddleware` applied. The instance management routes live under `/api/instances` without instance scoping.

```go
// In NewRouter():
instancesRouter := apiRouter.PathPrefix("/instance/{name}").Subrouter()
instancesRouter.Use(InstanceMiddleware)

// Register scoped routes
instancesRouter.Methods("POST").Path("/start").Name("StartInstance").Handler(StartInstance)
instancesRouter.Methods("POST").Path("/stop").Name("StopInstance").Handler(StopInstance)
instancesRouter.Methods("POST").Path("/kill").Name("KillInstance").Handler(KillInstance)
instancesRouter.Methods("GET").Path("/status").Name("InstanceStatus").Handler(InstanceStatus)
// ... all other scoped routes

// Instance management (no instance context)
apiRouter.Methods("GET").Path("/instances").Name("ListInstances").Handler(ListInstances)
apiRouter.Methods("POST").Path("/instances").Name("CreateInstance").Handler(CreateInstance)
apiRouter.Methods("DELETE").Path("/instances/{name}").Name("DeleteInstance").Handler(DeleteInstance)
apiRouter.Methods("POST").Path("/instances/repair").Name("RepairInstance").Handler(RepairInstance)
apiRouter.Methods("POST").Path("/instances/check-port").Name("CheckPortConflict").Handler(CheckPortConflict)
apiRouter.Methods("GET").Path("/instances/{name}").Name("GetInstance").Handler(GetInstance)
```

---

## 5. Frontend Architecture

### 5.1 New Routing Structure

```
/login                          → Login.jsx (unchanged)
/instances                      → InstanceList.jsx (NEW — landing page)
/instances/create               → InstanceCreate.jsx (NEW — creation wizard)
/instances/import-save          → InstanceImportSave.jsx (NEW — from save import)
/instance/:name                 → Layout.jsx (wrapped with InstanceProvider context)
/instance/:name/                → Controls.jsx
/instance/:name/saves           → Saves/
/instance/:name/mods            → Mods/
/instance/:name/server-settings → ServerSettings.jsx
/instance/:name/console         → Console.jsx
/instance/:name/logs            → Logs.jsx
/instance/:name/server-version  → ServerVersion.jsx
/instance/:name/event-log       → EventLog.jsx
```

**Default redirect:** `"/"` redirects to `"/instances"`.

### 5.2 InstanceProvider Context (NEW)

A React Context that holds the currently selected instance's name, status, and a subscription manager. Child pages access instance data via a `useInstance()` hook instead of prop drilling.

```jsx
const InstanceContext = React.createContext(null);

export function InstanceProvider({ children }) {
    const { name } = useParams();
    const [instance, setInstance] = useState(null);
    const [instanceStatus, setInstanceStatus] = useState(null);
    
    // Fetch instance metadata + status
    useEffect(() => {
        fetchInstance(name).then(setInstance);
        fetchInstanceStatus(name).then(setInstanceStatus);
    }, [name]);
    
    // Subscribe to per-instance websocket rooms
    useEffect(() => {
        socket.emit('subscribe', `instance/${name}/server_status`);
        socket.on(`instance/${name}/server_status`, (data) => {
            setInstanceStatus(JSON.parse(data));
        });
        return () => {
            socket.emit('unsubscribe', `instance/${name}/server_status`);
            socket.off(`instance/${name}/server_status`);
        };
    }, [name]);
    
    return (
        <InstanceContext.Provider value={{ instance, instanceStatus }}>
            {children}
        </InstanceContext.Provider>
    );
}

export function useInstance() {
    return useContext(InstanceContext);
}
```

This eliminates the `serverStatus` prop drilling pattern. All child views inside `/instance/:name/*` call `useInstance()`.

### 5.3 InstanceList Component (NEW)

Card-based grid showing all instances. Replaces the current root redirect which goes to Controls directly.

```
+--------------------------------------------------+
|  Instance List                         [+ Create]  |
|                                    [Import Save]  |
+--------------------------------------------------+
|  +------------------+  +------------------+      |
|  | My Server        |  | My Other Server  |      |
|  | Version: 2.1.0   |  | Version: 2.0.32  |      |
|  | Port: 34197       |  | Port: 34200      |      |
|  | Status: RUNNING   |  | Status: STOPPED  |      |
|  | [Enter] [Stop]   |  | [Enter] [Start]  |      |
|  +------------------+  +------------------+      |
|  +------------------+                             |
|  | Factory (empty)  |                             |
|  | Version: 2.0.28  |                             |
|  | Port: 34201       |                             |
|  | Status: STOPPED   |                             |
|  | [Enter] [Start]  |                             |
|  +------------------+                             |
+--------------------------------------------------+
```

Each card shows:
- Instance `display_name` (or `name` if display_name is empty)
- Factorio version (green badge if it's the latest stable, gray otherwise)
- Game port
- Status with colored indicator (green=Running, red=Stopped, yellow=Starting/Stopping, gray=Error)
- Click-to-enter link navigating to `/instance/{name}/`
- Quick action buttons: Start/Stop/Kill

### 5.4 InstanceCreate Component (NEW)

Two-step creation wizard.

**Step 1 — Choose method:**
- "Create blank instance" → show version selector dropdown populated from `/api/instance/{name}/version/available`
- "Create from save" → file upload prompt for Factorio save files (.zip)

**Step 2 — Configure:**
- Instance name (directory name, validated: lowercase alphanumeric + hyphens only)
- Display name (optional, free text)
- Game port (pre-filled with auto-assigned port, editable)
- Bind IP (pre-filled with 0.0.0.0)
- Show available RCON port (auto-assigned, read-only)
- "Auto-start on boot" toggle

**Validation:**
- Name must not already exist as an instance directory.
- Game port must pass `ValidatePort()` (no collision with any existing instance).
- Name length between 1 and 64 characters.
- Save file (if provided) must be a valid Factorio save (.zip).

**Submit flow:**
1. Frontend calls `POST /api/instances` with the form data.
2. Backend creates instance directory, downloads binary (if needed), initializes files.
3. Frontend polls or subscribes to progress WebSocket room.
4. On completion, redirect to `/instance/{name}/`.

### 5.5 InstanceSwitcher Component (NEW)

A dropdown in the Layout sidebar, replacing the current static server status area. Shows the current instance name and a dropdown to switch to other instances, plus a link back to the instance list.

```
+------------------------------------------+
|  Current Instance: My Server ▼           |
|  +-------------------------------------+ |
|  | My Server            Status: RUNNING | |
|  | My Other Server      Status: STOPPED | |
|  | Factory              Status: STOPPED | |
|  |──────────────────────────────────────| |
|  | ← All Instances                     | |
|  +-------------------------------------+ |
+------------------------------------------+
```

When switching instances, the page navigates to `/instance/{newName}/`. The Layout component detects the route change and re-renders with the new instance context.

### 5.6 Existing View Adaptations

All existing views (Controls.jsx, Saves.jsx, Mods.jsx, etc.) must be adapted:

1. **Remove `serverStatus` prop.** Replace with `const { instanceStatus } = useInstance();`
2. **Update API calls.** Replace `/api/server/start` with `/api/instance/{name}/start`, etc. The `name` comes from `instance.name`.
3. **Remove direct `server` resource calls.** Replace with a new instance-scoped API resource or pass `name` to all calls:

```jsx
// Before:
server.start(ip, port, savefile);

// After:
server.start(instanceName, ip, port, savefile);
```

Or use a scoped client:

```js
const instanceApi = (name) => ({
    start: (ip, port, savefile) =>
        client.post(`/api/instance/${name}/start`, { bindip: ip, savefile, port }),
    stop: () => client.post(`/api/instance/${name}/stop`),
    // ...
});
```

4. **WebSocket subscriptions.** Change from room name `gamelog` to `instance/{name}/gamelog`. Unsubscribe when leaving the instance view.

### 5.7 Frontend File Changes

| File | Change |
|------|--------|
| `ui/App/App.jsx` | Replace `/` redirect, add `/instances/*` routes, add `/instance/:name/*` layout route with `InstanceProvider` |
| `ui/App/views/InstanceList.jsx` | **NEW** — instance grid/table view |
| `ui/App/views/InstanceCreate.jsx` | **NEW** — two-step creation wizard |
| `ui/App/views/InstanceImportSave.jsx` | **NEW** — import from save page |
| `ui/App/context/InstanceProvider.jsx` | **NEW** — React Context + hook |
| `ui/App/components/Layout.jsx` | Replace static status panel with InstanceSwitcher, update sidebar links to `/instance/:name/*` |
| `ui/App/components/InstanceSwitcher.jsx` | **NEW** — dropdown switcher component |
| `ui/App/views/Controls.jsx` | Replace props with `useInstance()`, update API calls, update WebSocket subscriptions |
| `ui/App/views/Saves/Saves.jsx` | Replace props with `useInstance()`, update API calls |
| `ui/App/views/Mods/Mods.jsx` | Replace props with `useInstance()`, update API/WebSocket calls |
| `ui/App/views/ServerSettings.jsx` | Replace props with `useInstance()`, update API calls |
| `ui/App/views/Console.jsx` | Replace props with `useInstance()`, update WebSocket sub |
| `ui/App/views/Logs.jsx` | Replace props with `useInstance()`, update WebSocket sub |
| `ui/App/views/ServerVersion.jsx` | Replace props with `useInstance()`, update API/WebSocket calls |
| `ui/App/views/EventLog.jsx` | Replace props with `useInstance()` |
| `ui/api/resources/server.js` | Add instance-scoped methods (or create new `instance.js` resource file) |
| `ui/api/resources/instance.js` | **NEW** — instance management API resource (list/create/delete) |
| `ui/api/socket.js` | Add dynamic room subscription support (currently room subs are hardcoded functions; needs generalization) |
| `ui/locales/en/instance.json` | **NEW** — English translations for instance list, creation, switcher |
| `ui/locales/zh-CN/instance.json` | **NEW** — Chinese translations |
| `ui/i18n.js` | Register new `instance` namespace |

---

## 6. WebSocket Isolation

### 6.1 Room Name Scoping

All existing WebSocket rooms are prefixed with `instance/{name}/`. This ensures that when the operator views instance A, they do not see logs or status events from instance B.

| Old Room | New Room |
|----------|----------|
| `gamelog` | `instance/{name}/gamelog` |
| `server_status` | `instance/{name}/server_status` |
| `mod_install` | `instance/{name}/mod_install` |
| `mods_sync` | `instance/{name}/mods_sync` |
| `mods_events` | `instance/{name}/mods_events` |
| `server_version` | `instance/{name}/server_version` |

### 6.2 New Global Room: `instances`

A new room `instances` broadcasts global events: instance added, instance removed, instance status changed (stopped → running, etc.). All operators subscribe to this room to keep the instance list current.

**Event format:**
```json
{
    "room_name": "instances",
    "message": {
        "event": "instance_status_changed",
        "name": "my-server",
        "status": "running",
        "display_name": "My Server"
    }
}
```

**Events:**
| Event | Trigger | Payload |
|-------|---------|---------|
| `instance_added` | Instance created | name, display_name, status |
| `instance_removed` | Instance deleted | name |
| `instance_status_changed` | Start/Stop/Kill | name, status, display_name |

### 6.3 Frontend Subscription Management

The `socket.js` module currently hardcodes subscription functions for each room. For multi-instance support, the subscription system must become dynamic:

```js
// New approach: room name is a string parameter, no hardcoded functions
socket.subscribe(`instance/${name}/gamelog`);
socket.on(`instance/${name}/gamelog`, handler);
socket.unsubscribe(`instance/${name}/gamelog`);
```

The `connect()` function sends a generic subscribe control message:

```js
socket.send(JSON.stringify({
    room_name: "",
    controls: { type: "subscribe", value: roomName }
}));
```

The `bus` EventEmitter is extended to support dynamic room names without pre-registered helper functions.

### 6.4 Backend Broadcasting Changes

All existing `websocket.WebsocketHub.GetRoom("gamelog")` calls must be updated to include the instance name. Each Instance or its Server holds a reference to the instance name:

```go
// In server.go, parseRunningCommand:
wsRoom := websocket.WebsocketHub.GetRoom(fmt.Sprintf("instance/%s/gamelog", instName))
```

The instance name is passed to `Server` via the `InstanceName` field in `ServerConfig`. The Server stores this value and uses it to construct scoped WebSocket room names (e.g. `instance/{name}/gamelog`).

---

## 7. Error Handling

### 7.1 Port Conflict

- Checked during `POST /api/instances` (create) and `POST /api/instances/check-port`.
- Also checked during `POST /api/instance/{name}/start` (as a safety net).
- Conflict response: `409 Conflict` with `{"error": "Port 34197 is already in use by instance 'my-server'"}`.

### 7.2 Instance Deleted Externally

- If an instance directory is removed while FSM is running, next access to the instance returns `410 Gone`.
- The InstanceManager can detect missing directories: before any operation on an instance, stat its directory. If missing, mark as `StatusError` with a "missing" flag. UI shows a warning badge with "Instance directory missing" tooltip.
- Removal handling: the Instance remains in the `instances` map but is marked as missing. The operator can remove it from FSM's listing via a "Remove from panel" action (which just deletes the in-memory entry without affecting disk).

### 7.3 Missing instance.json but Has Files

- Detected during `Discover()`. The directory is loaded as a "pending repair" instance.
- Listed in the UI with an amber badge: "Missing configuration — repair?"
- Clicking repair triggers `POST /api/instances/repair` with `{name: "..."}`.

### 7.4 Disk Space

- Before creating an instance or downloading a Factorio binary, check available disk space on the partition containing `instances/`.
- If less than 500 MB available, reject with `507 Insufficient Storage`.

### 7.5 Instance Directory Already Exists

- `POST /api/instances` with an existing instance name returns `409 Conflict`.
- The UI pre-checks via a name uniqueness endpoint or inline validation.

### 7.6 Deleting a Running Instance

- `DELETE /api/instances/{name}` force-kills the Factorio process first (calls `inst.Kill()`), then removes the directory.
- If the kill fails (permissions, process zombie), return `500` with partial cleanup instructions.

### 7.7 Concurrent Start Serialization

- `InstanceManager.StartOperation()` / `EndOperation()` uses a mutex to serialize all start operations.
- If instance A is starting and an operator tries to start instance B, the second call blocks until A finishes or times out (30-second timeout, then release with error).

### 7.8 Frontend Error Display

- All instance operations have consistent error handling: error responses are displayed as dismissible flash messages at the top of the content area.
- Instance-specific errors show the instance name in the error message for clarity.
- WebSocket disconnection during an operation (e.g., version install) shows a reconnection banner but preserves the operation state; the user is advised to wait.

---

## 8. Testing Strategy

### 8.1 Unit Tests (Go)

| Test | What It Verifies |
|------|------------------|
| `TestNewManager` | InstanceManager initializes correctly with empty dir |
| `TestDiscoverEmpty` | Discover on empty directory returns empty list |
| `TestDiscoverValid` | Discovery loads valid instances from `instance.json` |
| `TestDiscoverInvalidJSON` | Corrupt `instance.json` flagged as error, not crash |
| `TestCreateInstance` | Creating a new instance writes `instance.json` and creates directory structure |
| `TestCreateInstanceFromSave` | Creating from save parses save, downloads binary, sets up directory |
| `TestRemoveInstance` | Removing instance deletes directory and removes from map |
| `TestRemoveRunningInstance` | Removing a running instance kills process first, then deletes |
| `TestPortConflict` | Two instances with same game port detected and rejected |
| `TestValidatePort_NoConflict` | Unique port passes validation |
| `TestInstanceAutostart` | Instances with `autostart: true` started after discovery |
| `TestConcurrentStart` | `StartOperation()`/`EndOperation()` serializes correctly |
| `TestSerializedStartBlocks` | Second start call blocks until first completes |
| `TestRepairGeneratesInstanceJSON` | Repair on valid directory structure generates correct metadata |
| `TestRepairSkipsEmptyDir` | Repair on empty directory returns error |
| `TestMetadataPersistence` | Writing and reading `instance.json` preserves all fields |
| `TestFactorioNewServer` | `NewServer()` creates a Server with correct paths and config |

**Test fixtures:**
- A `testdata/instances/` directory containing:
  - `valid-instance/` with a valid `instance.json` and minimal directory structure (empty dirs for `saves/`, `mods/`, `config/`).
  - `corrupt-instance/` with unparseable `instance.json`.
  - `partial-instance/` with `saves/` and a save file but no `instance.json`.
  - `empty-dir/` with no Factorio files at all.

### 8.2 Integration Tests

| Test | Steps | Expected |
|------|-------|----------|
| **Migration** | Start FSM with old-style root directories (`saves/`, `mods/`, etc.), no `instances/` | Migration creates `instances/default/` with all files moved and `instance.json` generated |
| **Skip migration** | Start FSM with existing `instances/` that already has contents | Migration skipped, root-level files left untouched, log message printed |
| **API create instance** | `POST /api/instances` with valid name | Instance created, `instance.json` written, directory structure built |
| **API list instances** | `GET /api/instances` after creating two instances | Returns both with correct status |
| **API start/stop lifecycle** | Start → status → stop → status | Status transitions Stopped→Starting→Running→Stopping→Stopped |
| **API port conflict** | Create with port already used by existing instance | `409 Conflict` with descriptive error |
| **API delete running** | Start instance, then DELETE it | Process killed, directory removed |
| **WebSocket per-instance** | Subscribe to `instance/a/gamelog`, check no messages from instance b | Instance-a logs only appear on instance-a subscription |
| **Backward compatibility** | `GET /api/server/status` | `308` redirect to `/api/instance/default/status` |
| **Frontend instance list** | Navigate to `/instances` | Shows all instances in card grid |
| **Frontend switcher** | Navigate to instance, use switcher dropdown | Switches to different instance, all views update |
| **Frontend create wizard** | Complete two-step creation flow | Instance created, redirected to new instance |

### 8.3 Frontend Testing (Manual)

| Scenario | Steps | Expected |
|----------|-------|----------|
| Instance list renders | Navigate to `/instances` with 2+ instances | Card grid shows each instance with name, version, port, status |
| Instance enter | Click on instance card | Navigate to `/instance/{name}/`, Controls page shows that instance's controls |
| Instance create blank | Create wizard, choose version, set name and port | New instance appears in list, ready to start |
| Instance create from save | Upload save file, set name | Instance created with save imported, mods synced |
| Instance switch | In Layout dropdown, switch to another instance | All view content updates to new instance |
| Start then switch | Start instance A, quickly switch to instance B | Instance A continues running, instance B shows its own status |
| Instance removed externally | Delete instance directory via SSH, refresh list | Instance shows as "missing" with repair/remove options |
| Backward compat old URLs | Navigate to old bookmarked `/` | Redirects to `/instances` |
| Error: port conflict on create | Try to create with same port as existing | Error message displayed, creation blocked |

### 8.4 Build Verification

```bash
go build ./...
# Must compile with zero errors for the new instance package

cd ui && npm run build
# Must complete with zero errors
```

### 8.5 Edge Cases

- **Zero instances:** After fresh install with no migration, the instance list is empty. The UI shows a "Create your first instance" empty state with prominent create button.
- **Single instance:** FSM with exactly one instance behaves almost identically to old single-instance FSM, except the URL is `/instance/default/` instead of `/`. Backward compatible redirects handle this transparently.
- **Many instances (20+):** Instance list uses virtualization or pagination if the count exceeds 50 (not anticipated for v1 but designed for).
- **Instance name with invalid filesystem characters:** Rejected at the API level with a clear error listing valid characters.
- **Factorio binary download failure during create:** Instance creation returns partial-creation error, cleans up directory. User can retry.
- **Simultaneous start of multiple instances:** Serialized by `StartOperation()`; the second request returns a `423 Locked` immediately rather than blocking indefinitely in the HTTP handler.

---

## 9. Data Migration

### 9.1 conf.json Changes

New field added to `conf.json`:

```json
{
    "instances_dir": "./instances",
    "...": "...existing fields..."
}
```

### 9.2 Instance Directory Changes to conf.json Paths

The following fields in `conf.json` are **removed** (they are now per-instance):

- `saves_dir`, `mods_dir`, `config_directory`, `factorio_binary`, `rcon_port`, `console_log_file`, `settings_file`, `factorio_admin_file`, `basemod_dir`

The following fields **stay** in conf.json:
- `logfile` (FSM's own log, not instance-scoped), `database_file`, `cookie_encryption_key`

### 9.3 SQLite Database

The SQLite database (GORM) currently stores user accounts and possibly session data. This remains unchanged—users are global, not per-instance. No database schema changes are required for v1.

### 9.4 Mod Pack Migration

The `mod_pack_dir` currently lives at the global config level and stores mod packs (named lists of mods). Mod packs are cross-instance (they're just lists of mod names with versions to install). For v1, mod packs remain global. A future version could add per-instance mod packs if needed.

---

## 10. Risks and Mitigations

### 10.1 Risk: Performance with Many Instances

**Risk:** Running 10+ Factorio processes simultaneously consumes significant CPU and memory, potentially starving the FSM web panel itself.

**Mitigation:**
- Document clearly that FSM is a manager, not a resource scheduler. The operator is responsible for ensuring the host has sufficient resources.
- Add a health check that warns in the UI if swap usage exceeds 50% or available memory is below 1 GB.
- The `StartOperation()` serialization prevents thundering-herd starts, but does not limit total running instances.

### 10.2 Risk: Migration Data Loss

**Risk:** The auto-migration from old single-instance layout to `instances/default/` could lose data if interrupted (partial file moves, crash during move).

**Mitigation:**
- Migration only runs if `instances/` does not exist AND the root has the expected old-style directories.
- Migration copies rather than moves the `data/` directory (it is large but recreatable from binary download).
- Files are moved (not copied) for saves, mods, and config (these are typically small and fast).
- If any move fails, the operator is alerted via log message with manual recovery instructions. No automatic cleanup is attempted to avoid making things worse.
- A `.migrated` sentinel file prevents re-migration on subsequent launches.

### 10.3 Risk: Existing API Clients Break

**Risk:** Operators who have scripts or monitoring tools calling `/api/server/status` or `/api/saves/list` will break when those paths 308-redirect.

**Mitigation:**
- Legacy endpoints redirect via HTTP 308 (Permanent Redirect) with the new path in the `Location` header. Well-behaved HTTP clients follow redirects transparently.
- The old paths are not removed—they remain permanently as redirect shims. No removal timeline.
- A deprecation warning is logged on first use of each legacy endpoint after an FSM restart.

### 10.4 Risk: Port Conflict with Other Services

**Risk:** An auto-assigned or manually-entered port may conflict with a non-FSM service running on the host (e.g., the web panel itself, an SSH server, a database).

**Mitigation:**
- `ValidatePort()` only checks FSM-managed instances. It does NOT check for OS-level port availability.
- Document that operators should verify ports with `ss -tlnp` or similar before assigning.
- Future enhancement (not in v1 scope): attempt a `net.Listen("udp", port)` probe to check port availability at OS level before committing.

### 10.5 Risk: Legacy default instance naming collision

**Risk:** The auto-migrated instance is named `default`, which could collide with a user manually creating an instance called `default`.

**Mitigation:**
- The migration check explicitly verifies that `instances/default/` does not already exist before running. If it exists, migration is skipped entirely.
- The name `default` is reserved. `POST /api/instances` with `name: "default"` is rejected with a clear error if the auto-migration already created it.

---

## 11. Decision Summary

- **Instance isolation model:** Each instance gets its own Factorio binary, saves, mods, config, and logs. No sharing at any level.
- **Metadata storage:** `instance.json` on disk (file as truth), not in database. Portable and resilient.
- **Package structure:** New `src/instance/` package with `manager.go`, `instance.go`, `discovery.go`, `repair.go`.
- **Singleton removal:** `factorio.GetFactorioServer()` is replaced by `factorio.NewServer(dir, config)` per-instance factory.
- **Config de-globalization:** `bootstrap.Config` retains only global settings; per-instance paths derive from instance directory.
- **API scoping:** All existing `/api/server/*`, `/api/saves/*`, `/api/mods/*` endpoints gain `/api/instance/{name}/*` scoped equivalents and redirect from old paths.
- **Frontend state:** React Context (`InstanceProvider`) replaces `serverStatus` prop drilling.
- **WebSocket isolation:** Room names prefixed with `instance/{name}/`; new global room `instances` for cross-instance events.
- **Auto-migration:** Old single-instance installations auto-migrate to `instances/default/` on first launch.
- **Port conflict detection:** InstanceManager validates port uniqueness across all loaded instances.
- **Authentication:** Unchanged—single login manages all instances.
- **Mod packs:** Remain global (cross-instance) for v1.
- **Database:** No schema changes for v1. Users remain global.
- **Autostart:** Per-instance field in `instance.json`. Global `--autostart` flag removed.

---

## 12. Implementation Order

### Phase 1: Backend Core (Instance Package + Factorio De-globalization)

| Step | File(s) | What |
|------|---------|------|
| 1.1 | `src/instance/manager.go` | Create `InstanceManager` struct with map, RWMutex, CRUD methods |
| 1.2 | `src/instance/instance.go` | Create `Instance` struct with lifecycle (`Start/Stop/Kill`), status management |
| 1.3 | `src/instance/discovery.go` | Auto-discovery scanning + `instance.json` read/write |
| 1.4 | `src/instance/repair.go` | Auto-repair: scan directory and generate `instance.json` |
| 1.5 | `src/factorio/server.go` | Replace global singleton with `NewServer(dir, config)` factory. Remove `GetFactorioServer()`, `SetFactorioServer()`, `var instantiated`. |
| 1.6 | `src/bootstrap/config.go` | Add `InstancesDir` field. Remove per-instance path assumptions. |
| 1.7 | `src/main.go` | Rewrite startup: init `InstanceManager`, run discovery, autostart, inject into API |

### Phase 2: API Layer

| Step | File(s) | What |
|------|---------|------|
| 2.1 | `src/api/routes.go` | Add instance management routes, scoped instance routes, `InstanceMiddleware`, legacy redirects |
| 2.2 | `src/api/instance_handler.go` (**NEW**) | Handlers for `ListInstances`, `CreateInstance`, `DeleteInstance`, `RepairInstance`, `CheckPort` |
| 2.3 | `src/api/instance_operation_handler.go` (**NEW**) | Handlers for `StartInstance`, `StopInstance`, `KillInstance`, `InstanceStatus` |
| 2.4 | `src/api/saves_handler.go` (refactor) | Refactor existing save handlers into instance-scoped versions |
| 2.5 | `src/api/mods_handler.go` (refactor) | Refactor existing mod handlers into instance-scoped versions |
| 2.6 | `src/api/settings_handler.go` (refactor) | Refactor settings handlers into instance-scoped versions |
| 2.7 | `src/api/log_handler.go` (refactor) | Refactor log tail handler into instance-scoped version |
| 2.8 | `src/api/version_handler.go` (refactor) | Refactor version handlers to instance context |
| 2.9 | `src/factorio/version_manager.go` | Accept instance context for per-instance binary download/install |

### Phase 3: WebSocket Isolation

| Step | File(s) | What |
|------|---------|------|
| 3.1 | `src/api/websocket/wshub.go` | Add `instances` global room for cross-instance event broadcasting |
| 3.2 | `src/factorio/server.go` | Update `parseRunningCommand` to use instance-scoped room names |
| 3.3 | `src/factorio/server.go` | Update `SetRunning` to broadcast to instance-scoped `server_status` |
| 3.4 | `src/factorio/mod_*.go` | Update WebSocket room references to include instance name prefix |
| 3.5 | `src/factorio/version_manager.go` | Update WebSocket room to `instance/{name}/server_version` |

### Phase 4: Migration

| Step | File(s) | What |
|------|---------|------|
| 4.1 | `src/instance/migrate.go` (**NEW**) | Auto-migration from old root layout to `instances/default/` |
| 4.2 | `src/main.go` | Add migration call before discovery |

### Phase 5: Frontend

| Step | File(s) | What |
|------|---------|------|
| 5.1 | `ui/App/context/InstanceProvider.jsx` | Create Context + hook |
| 5.2 | `ui/App/views/InstanceList.jsx` | Create instance list card grid |
| 5.3 | `ui/App/views/InstanceCreate.jsx` | Create two-step wizard |
| 5.4 | `ui/App/views/InstanceImportSave.jsx` | Create save import page |
| 5.5 | `ui/App/components/InstanceSwitcher.jsx` | Create layout dropdown |
| 5.6 | `ui/App/App.jsx` | Restructure routes, add InstanceProvider |
| 5.7 | `ui/App/components/Layout.jsx` | Replace status panel with InstanceSwitcher, update links |
| 5.8 | `ui/App/views/Controls.jsx` | Adapt to `useInstance()` |
| 5.9 | `ui/App/views/Saves/Saves.jsx` | Adapt to `useInstance()` |
| 5.10 | `ui/App/views/Mods/Mods.jsx` | Adapt to `useInstance()` |
| 5.11 | `ui/App/views/ServerSettings.jsx` | Adapt to `useInstance()` |
| 5.12 | `ui/App/views/Console.jsx` | Adapt to `useInstance()` |
| 5.13 | `ui/App/views/Logs.jsx` | Adapt to `useInstance()` |
| 5.14 | `ui/App/views/ServerVersion.jsx` | Adapt to `useInstance()` |
| 5.15 | `ui/App/views/EventLog.jsx` | Adapt to `useInstance()` |
| 5.16 | `ui/api/socket.js` | Generalize room subscription to support dynamic names |
| 5.17 | `ui/api/resources/instance.js` | New instance management API resource |
| 5.18 | `ui/api/resources/server.js` | Add instance-scoped methods |
| 5.19 | `ui/locales/en/instance.json` | English strings |
| 5.20 | `ui/locales/zh-CN/instance.json` | Chinese strings |
| 5.21 | `ui/i18n.js` | Register `instance` namespace |

### Phase 6: Testing and Polish

| Step | What |
|------|------|
| 6.1 | Write Go unit tests for `instance/` package |
| 6.2 | Write Go unit tests for migration |
| 6.3 | Manual integration test: migration from old layout |
| 6.4 | Manual integration test: create, start, stop, delete instances |
| 6.5 | Manual integration test: WebSocket isolation between instances |
| 6.6 | Manual integration test: backward compat API redirects |
| 6.7 | `go build ./...` verification |
| 6.8 | `cd ui && npm run build` verification |
| 6.9 | Visual QA pass on all new/modified pages |

---

## Appendix A: Files Changed Summary

| File | Change Type |
|------|------------|
| `src/instance/manager.go` | **New** |
| `src/instance/instance.go` | **New** |
| `src/instance/discovery.go` | **New** |
| `src/instance/repair.go` | **New** |
| `src/instance/migrate.go` | **New** |
| `src/main.go` | Modify (rewrite startup flow) |
| `src/bootstrap/config.go` | Modify (add `InstancesDir`, trim per-instance fields from global) |
| `src/factorio/server.go` | Modify (add `NewServer` factory, remove singleton) |
| `src/api/routes.go` | Modify (add instance routes, middleware, legacy redirects) |
| `src/api/instance_handler.go` | **New** |
| `src/api/instance_operation_handler.go` | **New** |
| `src/api/handlers.go` | Modify (refactor server/saves/settings handlers to delegate to instance-scoped) |
| `src/api/version_handler.go` | Modify (refactor to accept instance context) |
| `src/api/websocket/wshub.go` | Modify (add `instances` global room) |
| `src/factorio/version_manager.go` | Modify (accept instance context for per-instance binary) |
| `ui/App/context/InstanceProvider.jsx` | **New** |
| `ui/App/views/InstanceList.jsx` | **New** |
| `ui/App/views/InstanceCreate.jsx` | **New** |
| `ui/App/views/InstanceImportSave.jsx` | **New** |
| `ui/App/components/InstanceSwitcher.jsx` | **New** |
| `ui/App/App.jsx` | Modify (restructure routes) |
| `ui/App/components/Layout.jsx` | Modify (InstanceSwitcher, sidebar links) |
| `ui/App/views/Controls.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/Saves/Saves.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/Mods/Mods.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/ServerSettings.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/Console.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/Logs.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/ServerVersion.jsx` | Modify (use `useInstance()`) |
| `ui/App/views/EventLog.jsx` | Modify (use `useInstance()`) |
| `ui/api/socket.js` | Modify (dynamic room subscription) |
| `ui/api/resources/instance.js` | **New** |
| `ui/api/resources/server.js` | Modify (add instance-scoped methods) |
| `ui/locales/en/instance.json` | **New** |
| `ui/locales/zh-CN/instance.json` | **New** |
| `ui/i18n.js` | Modify (register `instance` namespace) |

---

*End of spec.*
