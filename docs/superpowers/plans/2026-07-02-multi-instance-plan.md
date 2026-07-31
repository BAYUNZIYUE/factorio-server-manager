# 多实例支持实现计划

**日期:** 2026-07-02
**项目:** factorio-server-manager
**分支:** feat/multi-instance
**规格文档:** `docs/superpowers/specs/2026-07-02-multi-instance-design.md`

---

## 实现策略概述

本计划将规格文档分解为 6 个阶段共 58 个具体任务。每个任务耗时 2-5 分钟，按依赖顺序排列。

**核心原则：** 基础设施优先 → API 层 → WebSocket 隔离 → 迁移 → 前端 → 测试。

---

## Phase 1: 后端核心 — Instance 包 + Factorio 去全局化 (1.1–1.9)

### 1.1 创建 `src/instance/instance.go` — Instance 结构体与生命周期

**文件:** `src/instance/instance.go` (新建)

```go
package instance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
)

type InstanceStatus int

const (
	StatusStopped   InstanceStatus = iota
	StatusStarting
	StatusRunning
	StatusStopping
	StatusError
)

func (s InstanceStatus) String() string {
	switch s {
	case StatusStopped:
		return "stopped"
	case StatusStarting:
		return "starting"
	case StatusRunning:
		return "running"
	case StatusStopping:
		return "stopping"
	case StatusError:
		return "error"
	default:
		return "unknown"
	}
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

type Instance struct {
	metadata InstanceMetadata
	server   *factorio.Server
	status   InstanceStatus
	statusMu sync.RWMutex
	dir      string
}

func NewInstance(dir string, meta InstanceMetadata, srv *factorio.Server) *Instance {
	return &Instance{dir: dir, metadata: meta, server: srv, status: StatusStopped}
}

func (inst *Instance) Start() error {
	inst.SetStatus(StatusStarting)
	err := inst.server.Run()
	if err != nil {
		inst.SetStatus(StatusError)
		return err
	}
	inst.SetStatus(StatusRunning)
	return nil
}

func (inst *Instance) Stop() error {
	inst.SetStatus(StatusStopping)
	err := inst.server.Stop()
	if err != nil {
		inst.SetStatus(StatusError)
		return err
	}
	inst.SetStatus(StatusStopped)
	return nil
}

func (inst *Instance) Kill() error {
	err := inst.server.Kill()
	if err != nil {
		inst.SetStatus(StatusError)
		return err
	}
	inst.SetStatus(StatusStopped)
	return nil
}

func (inst *Instance) Status() InstanceStatus {
	inst.statusMu.RLock()
	defer inst.statusMu.RUnlock()
	return inst.status
}

func (inst *Instance) SetStatus(s InstanceStatus) {
	inst.statusMu.Lock()
	defer inst.statusMu.Unlock()
	inst.status = s
}

func (inst *Instance) Server() *factorio.Server        { return inst.server }
func (inst *Instance) Metadata() InstanceMetadata       { return inst.metadata }
func (inst *Instance) Dir() string                      { return inst.dir }

func (inst *Instance) SaveMetadata() error {
	inst.metadata.UpdatedAt = time.Now().UTC()
	path := filepath.Join(inst.dir, "instance.json")
	data, err := json.MarshalIndent(inst.metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func LoadMetadata(dir string) (InstanceMetadata, error) {
	var meta InstanceMetadata
	path := filepath.Join(dir, "instance.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return meta, err
	}
	err = json.Unmarshal(data, &meta)
	return meta, err
}
```

**验证:** `go build ./src/instance/` — 应无编译错误。

---

### 1.2 创建 `src/instance/manager.go` — InstanceManager

**文件:** `src/instance/manager.go` (新建)

```go
package instance

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
)

type CreateOpts struct {
	Name        string
	DisplayName string
	GamePort    int
	RconPort    int
	BindIP      string
	Autostart   bool
}

type InstanceManager struct {
	mu        sync.RWMutex
	startMu   sync.Mutex
	instances map[string]*Instance
	rootDir   string
}

func NewManager(rootDir string) *InstanceManager {
	return &InstanceManager{
		instances: make(map[string]*Instance),
		rootDir:   rootDir,
	}
}

func (m *InstanceManager) Discover() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	entries, err := os.ReadDir(m.rootDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to read instances dir: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(m.rootDir, entry.Name())
		meta, err := LoadMetadata(dir)
		if err != nil {
			log.Printf("Instance discovery: %s has no valid instance.json (skipping): %v", entry.Name(), err)
			continue
		}
		inst, err := m.loadInstance(dir, meta)
		if err != nil {
			log.Printf("Instance discovery: failed to load %s: %v", entry.Name(), err)
			continue
		}
		m.instances[meta.Name] = inst
		log.Printf("Discovered instance: %s (port=%d, rcon=%d)", meta.Name, meta.GamePort, meta.RconPort)
	}
	return m.validatePortsLocked()
}

func (m *InstanceManager) loadInstance(dir string, meta InstanceMetadata) (*Instance, error) {
	binaryPath := filepath.Join(dir, "bin", "x64", "factorio")
	if _, err := os.Stat(binaryPath); err != nil {
		log.Printf("Instance %s: binary not found at %s", meta.Name, binaryPath)
	}

	config := factorio.ServerConfig{
		InstanceName: meta.Name,
		BinaryPath:   binaryPath,
		SavesDir:     filepath.Join(dir, "saves"),
		ModsDir:      filepath.Join(dir, "mods"),
		ConfigDir:    filepath.Join(dir, "config"),
		SettingsFile: filepath.Join(dir, "config", "server-settings.json"),
		GamePort:     meta.GamePort,
		RconPort:     meta.RconPort,
		BindIP:       meta.BindIP,
		ConsoleLog:   filepath.Join(dir, "factorio-server-console.log"),
	}

	srv := factorio.NewServer(dir, config)
	return NewInstance(dir, meta, srv), nil
}

func (m *InstanceManager) Create(name string, opts CreateOpts) (*Instance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.instances[name]; exists {
		return nil, fmt.Errorf("instance %q already exists", name)
	}

	dir := filepath.Join(m.rootDir, name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create instance dir: %w", err)
	}
	for _, sub := range []string{"saves", "mods", "config", "bin", "bin/x64"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0755); err != nil {
			return nil, fmt.Errorf("failed to create %s: %w", sub, err)
		}
	}

	meta := InstanceMetadata{
		Name:      name,
		GamePort:  opts.GamePort,
		RconPort:  opts.RconPort,
		BindIP:    opts.BindIP,
		Autostart: opts.Autostart,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	if opts.DisplayName != "" {
		meta.DisplayName = opts.DisplayName
	} else {
		meta.DisplayName = name
	}

	inst, err := m.loadInstance(dir, meta)
	if err != nil {
		return nil, err
	}
	if err := inst.SaveMetadata(); err != nil {
		return nil, fmt.Errorf("failed to write instance.json: %w", err)
	}
	m.instances[name] = inst
	log.Printf("Created instance: %s (dir=%s)", name, dir)
	return inst, nil
}

func (m *InstanceManager) Remove(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[name]
	if !ok {
		return fmt.Errorf("instance %q not found", name)
	}
	if inst.Status() == StatusRunning || inst.Status() == StatusStarting {
		if err := inst.Kill(); err != nil {
			log.Printf("Warning: failed to kill instance %s: %v", name, err)
		}
	}
	dir := inst.Dir()
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("failed to remove dir %s: %w", dir, err)
	}
	delete(m.instances, name)
	log.Printf("Removed instance: %s", name)
	return nil
}

func (m *InstanceManager) Get(name string) (*Instance, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	inst, ok := m.instances[name]
	return inst, ok
}

func (m *InstanceManager) List() []*Instance {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*Instance, 0, len(m.instances))
	for _, inst := range m.instances {
		list = append(list, inst)
	}
	return list
}

func (m *InstanceManager) ValidatePort(port int) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, inst := range m.instances {
		meta := inst.Metadata()
		if meta.GamePort == port || meta.RconPort == port {
			return fmt.Errorf("port %d is already in use by %q", port, meta.Name)
		}
	}
	return nil
}

func (m *InstanceManager) ByPort(port int) *Instance {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, inst := range m.instances {
		meta := inst.Metadata()
		if meta.GamePort == port || meta.RconPort == port {
			return inst
		}
	}
	return nil
}

func (m *InstanceManager) StartOperation() { m.startMu.Lock() }
func (m *InstanceManager) EndOperation()   { m.startMu.Unlock() }

func (m *InstanceManager) validatePortsLocked() error {
	ports := make(map[int]string)
	for _, inst := range m.instances {
		meta := inst.Metadata()
		if existing, ok := ports[meta.GamePort]; ok {
			return fmt.Errorf("port %d conflict between %q and %q", meta.GamePort, existing, meta.Name)
		}
		ports[meta.GamePort] = meta.Name
		if existing, ok := ports[meta.RconPort]; ok {
			return fmt.Errorf("rcon port %d conflict between %q and %q", meta.RconPort, existing, meta.Name)
		}
		ports[meta.RconPort] = meta.Name
	}
	return nil
}
```

**验证:** `go build ./src/instance/` — 应无编译错误。

---

### 1.3 创建 `src/instance/discovery.go` — 自动发现与修复

**文件:** `src/instance/discovery.go` (新建)

```go
package instance

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"
)

func needsRepair(dir string) bool {
	binaryPath := filepath.Join(dir, "bin", "x64", "factorio")
	if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
		return false
	}
	savesPath := filepath.Join(dir, "saves")
	modsPath := filepath.Join(dir, "mods")
	if _, err := os.Stat(savesPath); os.IsNotExist(err) {
		if _, err := os.Stat(modsPath); os.IsNotExist(err) {
			return false
		}
	}
	return true
}

func (m *InstanceManager) Repair(name string) (*Instance, error) {
	dir := filepath.Join(m.rootDir, name)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil, fmt.Errorf("directory %s does not exist", dir)
	}

	binaryPath := filepath.Join(dir, "bin", "x64", "factorio")
	if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("no binary at %s", binaryPath)
	}

	version, err := extractBinaryVersion(binaryPath)
	if err != nil {
		log.Printf("Warning: could not extract version: %v", err)
		version = ""
	}

	gamePort := 34197
	settingsPath := filepath.Join(dir, "config", "server-settings.json")
	if data, err := os.ReadFile(settingsPath); err == nil {
		if p := extractPortFromSettings(data); p > 0 {
			gamePort = p
		}
	}
	rconPort := randomPortRange(40000, 45000)

	meta := InstanceMetadata{
		Name:            name,
		DisplayName:     name,
		FactorioVersion: version,
		GamePort:        gamePort,
		RconPort:        rconPort,
		BindIP:          "0.0.0.0",
		Autostart:       false,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}

	m.mu.RLock()
	err = m.validatePortsForNew(meta.GamePort, meta.RconPort)
	m.mu.RUnlock()
	if err != nil {
		return nil, fmt.Errorf("port conflict: %w", err)
	}

	inst, err := m.loadInstance(dir, meta)
	if err != nil {
		return nil, err
	}
	if err := inst.SaveMetadata(); err != nil {
		return nil, fmt.Errorf("failed to write instance.json: %w", err)
	}
	m.mu.Lock()
	m.instances[name] = inst
	m.mu.Unlock()
	log.Printf("Repaired instance: %s (port=%d)", name, gamePort)
	return inst, nil
}

func (m *InstanceManager) validatePortsForNew(gamePort, rconPort int) error {
	for _, inst := range m.instances {
		meta := inst.Metadata()
		if meta.GamePort == gamePort {
			return fmt.Errorf("game port %d already in use by %q", gamePort, meta.Name)
		}
		if meta.RconPort == rconPort {
			return fmt.Errorf("rcon port %d already in use by %q", rconPort, meta.Name)
		}
	}
	return nil
}

func extractBinaryVersion(binaryPath string) (string, error) {
	cmd := exec.Command(binaryPath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to run --version: %w", err)
	}
	reg := regexp.MustCompile(`Version\s+((\d+\.)?(\d+\.)?(\*|\d+)+)`)
	found := reg.FindStringSubmatch(string(output))
	if len(found) < 2 {
		return "", fmt.Errorf("could not parse version")
	}
	return found[1], nil
}

func extractPortFromSettings(data []byte) int {
	re := regexp.MustCompile(`"game_port"\s*:\s*(\d+)`)
	m := re.FindStringSubmatch(string(data))
	if len(m) >= 2 {
		var port int
		fmt.Sscanf(m[1], "%d", &port)
		return port
	}
	return 0
}

func randomPortRange(min, max int) int {
	rand.Seed(time.Now().UnixNano())
	return rand.Intn(max-min) + min
}
```

**验证:** `go build ./src/instance/` — 应无编译错误。

---

### 1.4 重构 `src/factorio/server.go` — 添加 NewServer 工厂

**文件:** `src/factorio/server.go` (修改)

**变更 A:** 在第 24 行后添加 ServerConfig 结构体:

`oldString:` 第 24-42 行
```go
type Server struct {
	Cmd            *exec.Cmd              `json:"-"`
	Savefile       string                 `json:"savefile"`
	Latency        int                    `json:"latency"`
	BindIP         string                 `json:"bindip"`
	Port           int                    `json:"port"`
	Running        bool                   `json:"running"`
	Version        Version                `json:"fac_version"`
	BaseModVersion string                 `json:"base_mod_version"`
	StdOut         io.ReadCloser          `json:"-"`
	StdErr         io.ReadCloser          `json:"-"`
	StdIn          io.WriteCloser         `json:"-"`
	Settings       map[string]interface{} `json:"-"`
	Rcon           *rcon.RemoteConsole    `json:"-"`
	LogChan        chan []string          `json:"-"`
}

var instantiated Server
var once sync.Once
```

`newString:`
```go
// ServerConfig holds per-instance configuration for a Factorio server.
type ServerConfig struct {
	InstanceName    string
	BinaryPath      string
	SavesDir        string
	ModsDir         string
	ConfigDir       string
	SettingsFile    string
	GamePort        int
	RconPort        int
	BindIP          string
	ConsoleLog      string
	CredentialsFile string
}

type Server struct {
	Cmd            *exec.Cmd              `json:"-"`
	Savefile       string                 `json:"savefile"`
	Latency        int                    `json:"latency"`
	BindIP         string                 `json:"bindip"`
	Port           int                    `json:"port"`
	Running        bool                   `json:"running"`
	Version        Version                `json:"fac_version"`
	BaseModVersion string                 `json:"base_mod_version"`
	StdOut         io.ReadCloser          `json:"-"`
	StdErr         io.ReadCloser          `json:"-"`
	StdIn          io.WriteCloser         `json:"-"`
	Settings       map[string]interface{} `json:"-"`
	Rcon           *rcon.RemoteConsole    `json:"-"`
	LogChan        chan []string          `json:"-"`
	config         ServerConfig           `json:"-"`
	InstanceName   string                 `json:"-"`
}

// NewServer creates a new Server with per-instance configuration.
func NewServer(instanceDir string, cfg ServerConfig) *Server {
	srv := &Server{
		Settings:     make(map[string]interface{}),
		config:       cfg,
		InstanceName: cfg.InstanceName,
	}
	srv.BindIP = cfg.BindIP
	if srv.BindIP == "" {
		srv.BindIP = "0.0.0.0"
	}
	srv.Port = cfg.GamePort
	if srv.Port == 0 {
		srv.Port = 34197
	}
	if data, err := os.ReadFile(cfg.SettingsFile); err == nil {
		json.Unmarshal(data, &srv.Settings)
	}
	return srv
}
```

**变更 B:** 删除 `var instantiated Server`, `var once sync.Once`, `SetFactorioServer()`, `NewFactorioServer()`, `GetFactorioServer()` — 这些已不再需要。直接删除相关代码块。

`oldString:` `var instantiated Server\nvar once sync.Once\n\nfunc (server *Server) SetRunning` — 但更精确:
删除 `func SetFactorioServer(server Server)` (第 78-80 行), 删除整个 `func NewFactorioServer() (err error)` (第 82-219 行), 删除 `func GetFactorioServer() (f *Server)` (第 221-223 行).

**变更 C:** 更新 `SetRunning()` 使用实例范围的 WebSocket room:
`oldString:` (第 44-52 行)
```go
func (server *Server) SetRunning(newState bool) {
	if server.Running != newState {
		log.Println("new state, will also send to correct room")
		server.Running = newState
		wsRoom := websocket.WebsocketHub.GetRoom("server_status")
		response, _ := json.Marshal(server)
		wsRoom.Send(string(response))
	}
}
```
`newString:`
```go
func (server *Server) SetRunning(newState bool) {
	if server.Running != newState {
		server.Running = newState
		roomName := fmt.Sprintf("instance/%s/server_status", server.InstanceName)
		wsRoom := websocket.WebsocketHub.GetRoom(roomName)
		response, _ := json.Marshal(server)
		wsRoom.Send(string(response))
	}
}
```
在 import 中添加 `"fmt"`。

**变更 D:** 更新 `parseRunningCommand` 中的 WS room:
`oldString:` `wsRoom := websocket.WebsocketHub.GetRoom("gamelog")`
`newString:` `wsRoom := websocket.WebsocketHub.GetRoom(fmt.Sprintf("instance/%s/gamelog", server.InstanceName))`

**变更 E:** 更新 `writeLog` 使用 `server.config.ConsoleLog`:
`oldString:` (第 379-397 行)
```go
func (server *Server) writeLog(logline string) error {
	config := bootstrap.GetConfig()
	logfileName := config.ConsoleLogFile
	...
}
```
`newString:`
```go
func (server *Server) writeLog(logline string) error {
	logfileName := server.config.ConsoleLog
	if logfileName == "" {
		globalConfig := bootstrap.GetConfig()
		logfileName = globalConfig.ConsoleLogFile
	}
	file, err := os.OpenFile(logfileName, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		log.Printf("Cannot open logfile %s: %v", logfileName, err)
		return err
	}
	defer file.Close()
	logline = logline + "\n"
	if _, err = file.WriteString(logline); err != nil {
		log.Printf("Error appending to %s: %v", logfileName, err)
		return err
	}
	return nil
}
```

**变更 F:** 在文件末尾添加全局变量作为过渡:
```go
// GlobalInstanceManager is set by main.go. Used by legacy ws control handlers.
var GlobalInstanceManager *instance.InstanceManager
```

在 import 中添加 `"github.com/OpenFactorioServerManager/factorio-server-manager/instance"`。

**变更 G:** 更新 `serverWebsocketControl()`:
```go
func serverWebsocketControl(controls websocket.WsControls) {
	log.Println(controls)
	if controls.Type == "command" {
		command := controls.Value
		if GlobalInstanceManager != nil {
			for _, inst := range GlobalInstanceManager.List() {
				srv := inst.Server()
				if srv.GetRunning() {
					reqId, err := srv.Rcon.Write(command)
					if err != nil {
						log.Printf("Error sending rcon command to %s: %v", inst.Metadata().Name, err)
						continue
					}
					log.Printf("Command sent to %s, id: %v", inst.Metadata().Name, reqId)
				}
			}
		}
	}
}
```

**验证:** `go build ./src/factorio/` — 应无编译错误。

---

### 1.5 添加 `ListSavesInDir` 辅助函数

**文件:** `src/factorio/saves.go` (修改)

在 `ListSaves` 函数之前添加(在 `func ListSaves` 上方):

`oldString:` `// Lists save files in factorio/saves\nfunc ListSaves() (saves []Save, err error) {`

`newString:`
```go
// ListSavesInDir lists save files in the given directory.
func ListSavesInDir(savesDir string) (saves []Save, err error) {
	saves = []Save{}
	err = filepath.Walk(savesDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info == nil || info.IsDir() {
			return nil
		}
		saves = append(saves, Save{info.Name(), info.ModTime(), info.Size()})
		return nil
	})
	return
}

// Lists save files in factorio/saves
func ListSaves() (saves []Save, err error) {
	config := bootstrap.GetConfig()
	return ListSavesInDir(config.FactorioSavesDir)
}
```

**验证:** `go build ./src/factorio/` — 应无编译错误。

---

### 1.6 更新 `src/bootstrap/config.go` — 添加 InstancesDir 字段

**文件:** `src/bootstrap/config.go` (修改)

**变更 A:** 在 Flags 结构体添加 InstancesDir:
`oldString:` `ConfFile string \`long:"conf" default:"./conf.json"...\``
`newString:`
```go
	ConfFile           string `long:"conf" default:"./conf.json" description:"Specify location of Factorio Server Manager config file." env:"FSM_CONF"`
	InstancesDir       string `long:"instances-dir" default:"./instances" description:"Directory containing Factorio server instances." env:"FSM_INSTANCES_DIR"`
```

**变更 B:** 在 Config 结构体添加 InstancesDir:
`oldString:` `type Config struct {\n\tFactorioDir`
`newString:`
```go
type Config struct {
	InstancesDir            string `json:"instances_dir,omitempty"`
	FactorioDir             string `json:"factorio_dir,omitempty"`
```

**变更 C:** 在 `mapFlags` 中映射:
`oldString:` `func (config *Config) mapFlags(flags Flags) {\n\tconfig.Autostart = flags.Autostart`
`newString:`
```go
func (config *Config) mapFlags(flags Flags) {
	config.InstancesDir = flags.InstancesDir
	config.Autostart = flags.Autostart
```

**验证:** `go build ./src/bootstrap/` — 应无编译错误。

---

### 1.7 重写 `src/main.go` — 新的启动流程

**文件:** `src/main.go` (修改)

旧内容(整个文件):
```go
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api"
	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
)

func main() {
	config := bootstrap.NewConfig(os.Args[1:])
	factorio.ModStartUp()
	err := factorio.NewFactorioServer()
	if err != nil {
		log.Printf("Error occurred during Server initialization: %v\n", err)
		return
	}
	api.SetupAuth()
	router := api.NewRouter()
	log.Printf("Starting server on: %s:%s", config.ServerIP, config.ServerPort)
	log.Fatal(http.ListenAndServe(config.ServerIP+":"+config.ServerPort, router))
}
```

新内容:
```go
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api"
	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
)

func main() {
	config := bootstrap.NewConfig(os.Args[1:])

	manager := instance.NewManager(config.InstancesDir)

	// Migration: old single-instance layout -> instances/default/
	if needsMigration(config) {
		if err := instance.MigrateToMultiInstance(config); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		// Re-discover after migration
		manager = instance.NewManager(config.InstancesDir)
	}

	if err := manager.Discover(); err != nil {
		log.Fatalf("Error discovering instances: %v", err)
	}

	factorio.GlobalInstanceManager = manager
	api.SetInstanceManager(manager)

	factorio.ModStartUp()

	// Auto-start instances with autostart=true
	for _, inst := range manager.List() {
		if inst.Metadata().Autostart {
			inst := inst
			go func() {
				log.Printf("Auto-starting instance: %s", inst.Metadata().Name)
				if err := inst.Start(); err != nil {
					log.Printf("Error auto-starting instance %s: %v", inst.Metadata().Name, err)
				}
			}()
		}
	}

	api.SetupAuth()
	router := api.NewRouter()

	log.Printf("Starting server on: %s:%s", config.ServerIP, config.ServerPort)
	log.Fatal(http.ListenAndServe(config.ServerIP+":"+config.ServerPort, router))
}

func needsMigration(config bootstrap.Config) bool {
	if _, err := os.Stat(config.InstancesDir); !os.IsNotExist(err) {
		return false // instances/ exists
	}
	if _, err := os.Stat("saves"); os.IsNotExist(err) {
		return false
	}
	if _, err := os.Stat("mods"); os.IsNotExist(err) {
		return false
	}
	return true
}
```

**验证:** `go build ./...` — 应无编译错误。

---

### 1.8 在 `src/api/handlers.go` 中添加全局 InstanceManager

**文件:** `src/api/handlers.go` (修改)

在 import 块后, `const readHttpBodyError` 之前添加:

```go
import (
	// ... existing imports
	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
)

var instanceManager *instance.InstanceManager

func SetInstanceManager(mgr *instance.InstanceManager) {
	instanceManager = mgr
}
```

**验证:** `go build ./src/api/` — 应无编译错误。

---



### 1.9 创建 `src/instance/migrate.go` — 自动迁移

**文件:** `src/instance/migrate.go` (新建)

```go
package instance

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
)

// MigrateToMultiInstance performs one-time migration from old single-instance layout.
func MigrateToMultiInstance(config bootstrap.Config) error {
	log.Println("Starting migration to multi-instance layout...")

	sentinelFile := filepath.Join(config.InstancesDir, ".migrated")
	if _, err := os.Stat(sentinelFile); err == nil {
		log.Println("Migration already completed, skipping")
		return nil
	}

	defaultDir := filepath.Join(config.InstancesDir, "default")
	if _, err := os.Stat(defaultDir); err == nil {
		log.Printf("Default instance dir %s exists, skipping", defaultDir)
		return nil
	}

	if err := os.MkdirAll(defaultDir, 0755); err != nil {
		return fmt.Errorf("failed to create %s: %w", defaultDir, err)
	}
	for _, sub := range []string{"saves", "mods", "config", "bin", "bin/x64", "data"} {
		if err := os.MkdirAll(filepath.Join(defaultDir, sub), 0755); err != nil {
			return fmt.Errorf("failed to create %s: %w", sub, err)
		}
	}

	migrations := []struct{ src, dst string }{
		{"saves", filepath.Join(defaultDir, "saves")},
		{"mods", filepath.Join(defaultDir, "mods")},
		{"config", filepath.Join(defaultDir, "config")},
	}
	if _, err := os.Stat("bin"); err == nil {
		migrations = append(migrations, struct{ src, dst string }{"bin", filepath.Join(defaultDir, "bin")})
	}
	if _, err := os.Stat("factorio-server-console.log"); err == nil {
		migrations = append(migrations, struct{ src, dst string }{"factorio-server-console.log", filepath.Join(defaultDir, "factorio-server-console.log")})
	}

	for _, m := range migrations {
		if _, err := os.Stat(m.src); os.IsNotExist(err) {
			continue
		}
		log.Printf("Moving %s -> %s", m.src, m.dst)
		if err := os.Rename(m.src, m.dst); err != nil {
			if cpErr := copyAndRemove(m.src, m.dst); cpErr != nil {
				return fmt.Errorf("failed to move %s: %w", m.src, cpErr)
			}
		}
	}

	if _, err := os.Stat("data"); err == nil {
		log.Println("Copying data/ -> instances/default/data/")
		if err := copyDir("data", filepath.Join(defaultDir, "data")); err != nil {
			log.Printf("Warning: failed to copy data/: %v", err)
		}
	}

	meta := InstanceMetadata{
		Name:        "default",
		DisplayName: "Default",
		GamePort:    34197,
		RconPort:    randomPortRange(40000, 45000),
		BindIP:      "0.0.0.0",
		Autostart:   false,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	binaryPath := filepath.Join(defaultDir, "bin", "x64", "factorio")
	if _, err := os.Stat(binaryPath); err == nil {
		if v, err := extractBinaryVersion(binaryPath); err == nil {
			meta.FactorioVersion = v
		}
	}

	metaPath := filepath.Join(defaultDir, "instance.json")
	metaData, _ := json.MarshalIndent(meta, "", "  ")
	if err := os.WriteFile(metaPath, metaData, 0644); err != nil {
		return fmt.Errorf("failed to write instance.json: %w", err)
	}
	if err := os.WriteFile(sentinelFile, []byte("migrated"), 0644); err != nil {
		log.Printf("Warning: failed to write sentinel: %v", err)
	}

	log.Println("Migration completed successfully")
	return nil
}

func copyAndRemove(src, dst string) error {
	if err := copyDir(src, dst); err != nil {
		return err
	}
	return os.RemoveAll(src)
}

func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			srcFile, err := os.Open(srcPath)
			if err != nil {
				return err
			}
			dstFile, err := os.Create(dstPath)
			if err != nil {
				srcFile.Close()
				return err
			}
			_, err = io.Copy(dstFile, srcFile)
			srcFile.Close()
			dstFile.Close()
			if err != nil {
				return err
			}
		}
	}
	return nil
}
```

**验证:** `go build ./src/instance/` — 应无编译错误。

---

## Phase 2: API 层 (2.1–2.5)

### 2.1 创建 `src/api/instance_handler.go` — 实例管理端点

**文件:** `src/api/instance_handler.go` (新建)

```go
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"

	"github.com/gorilla/mux"
)

var validInstanceName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$`)

func ListInstances(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	instances := instanceManager.List()
	type summary struct {
		Name            string `json:"name"`
		DisplayName     string `json:"display_name"`
		Status          string `json:"status"`
		FactorioVersion string `json:"factorio_version,omitempty"`
		GamePort        int    `json:"game_port"`
		RconPort        int    `json:"rcon_port"`
		Autostart       bool   `json:"autostart"`
	}
	result := make([]summary, 0, len(instances))
	for _, inst := range instances {
		m := inst.Metadata()
		result = append(result, summary{
			Name: m.Name, DisplayName: m.DisplayName, Status: inst.Status().String(),
			FactorioVersion: m.FactorioVersion, GamePort: m.GamePort, RconPort: m.RconPort, Autostart: m.Autostart,
		})
	}
	json.NewEncoder(w).Encode(result)
}

func GetInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	vars := mux.Vars(r)
	inst, ok := instanceManager.Get(vars["name"])
	if !ok {
		http.Error(w, fmt.Sprintf("instance %q not found", vars["name"]), http.StatusNotFound)
		return
	}
	m := inst.Metadata()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"name": m.Name, "display_name": m.DisplayName, "status": inst.Status().String(),
		"factorio_version": m.FactorioVersion, "game_port": m.GamePort, "rcon_port": m.RconPort,
		"bind_ip": m.BindIP, "autostart": m.Autostart,
	})
}

func CreateInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var resp interface{}
	defer func() { WriteResponse(w, resp) }()

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		resp = "Error reading body"
		return
	}
	var body struct {
		Name        string `json:"name"`
		DisplayName string `json:"display_name"`
		GamePort    int    `json:"game_port"`
	}
	if err := json.Unmarshal(bodyBytes, &body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		resp = "Invalid JSON"
		return
	}

	if !validInstanceName.MatchString(body.Name) || len(body.Name) < 1 || len(body.Name) > 64 {
		w.WriteHeader(http.StatusBadRequest)
		resp = "Invalid instance name: lowercase alphanumeric with hyphens, 1-64 chars"
		return
	}
	if existing, _ := instanceManager.Get(body.Name); existing != nil {
		w.WriteHeader(http.StatusConflict)
		resp = fmt.Sprintf("Instance %q already exists", body.Name)
		return
	}

	gamePort := body.GamePort
	if gamePort == 0 {
		gamePort = 34197
		for instanceManager.ByPort(gamePort) != nil {
			gamePort++
		}
	}
	rconPort := randomPortRange(40000, 45000)
	for instanceManager.ByPort(rconPort) != nil {
		rconPort = randomPortRange(40000, 45000)
	}
	if err := instanceManager.ValidatePort(gamePort); err != nil {
		w.WriteHeader(http.StatusConflict)
		resp = err.Error()
		return
	}

	displayName := body.DisplayName
	if displayName == "" {
		displayName = body.Name
	}
	opts := instance.CreateOpts{Name: body.Name, DisplayName: displayName, GamePort: gamePort, RconPort: rconPort, BindIP: "0.0.0.0"}
	inst, err := instanceManager.Create(body.Name, opts)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		resp = fmt.Sprintf("Error creating instance: %s", err)
		return
	}
	broadcastInstanceEvent("instance_added", inst)
	m := inst.Metadata()
	w.WriteHeader(http.StatusCreated)
	resp = map[string]interface{}{"name": m.Name, "display_name": m.DisplayName, "game_port": m.GamePort, "rcon_port": m.RconPort, "status": inst.Status().String()}
}

func DeleteInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var resp interface{}
	defer func() { WriteResponse(w, resp) }()
	vars := mux.Vars(r)
	if _, ok := instanceManager.Get(vars["name"]); !ok {
		w.WriteHeader(http.StatusNotFound)
		resp = fmt.Sprintf("Instance %q not found", vars["name"])
		return
	}
	if err := instanceManager.Remove(vars["name"]); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		resp = fmt.Sprintf("Error deleting instance: %s", err)
		return
	}
	log.Printf("Instance %s deleted", vars["name"])
	resp = fmt.Sprintf("Instance %s deleted", vars["name"])
}

func RepairInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var resp interface{}
	defer func() { WriteResponse(w, resp) }()
	var body struct{ Name string `json:"name"` }
	b, _ := io.ReadAll(r.Body)
	json.Unmarshal(b, &body)
	if body.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		resp = "Name is required"
		return
	}
	inst, err := instanceManager.Repair(body.Name)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		resp = fmt.Sprintf("Error repairing: %s", err)
		return
	}
	broadcastInstanceEvent("instance_added", inst)
	m := inst.Metadata()
	resp = map[string]interface{}{"name": m.Name, "game_port": m.GamePort, "status": inst.Status().String()}
}

func CheckPortConflict(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var body struct{ Port int `json:"port"` }
	b, _ := io.ReadAll(r.Body)
	json.Unmarshal(b, &body)
	if body.Port == 0 {
		http.Error(w, "port is required", http.StatusBadRequest)
		return
	}
	err := instanceManager.ValidatePort(body.Port)
	json.NewEncoder(w).Encode(map[string]interface{}{"available": err == nil, "error": errMsg(err)})
}

func errMsg(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
```

**验证:** `go build ./src/api/` — 应无编译错误。

---

### 2.2 创建 `src/api/instance_operation_handler.go` — 实例操作端点

**文件:** `src/api/instance_operation_handler.go` (新建)

```go
package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func getInstanceFromRequest(r *http.Request) (*instance.Instance, error) {
	// Try context first (set by InstanceMiddleware)
	if inst, ok := r.Context().Value(instanceKey).(*instance.Instance); ok {
		return inst, nil
	}
	// Fallback to URL param
	vars := mux.Vars(r)
	inst, ok := instanceManager.Get(vars["name"])
	if !ok {
		return nil, fmt.Errorf("instance %q not found", vars["name"])
	}
	return inst, nil
}

func StartInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var resp interface{}
	defer func() { WriteResponse(w, resp) }()

	inst, err := getInstanceFromRequest(r)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		resp = err.Error()
		return
	}
	if inst.Status() == instance.StatusRunning {
		w.WriteHeader(http.StatusConflict)
		resp = "Server is already running"
		return
	}

	srv := inst.Server()
	srv.Savefile = "Load Latest"

	instanceManager.StartOperation()
	defer instanceManager.EndOperation()

	go func() {
		if err := inst.Start(); err != nil {
			log.Printf("Error starting %s: %v", inst.Metadata().Name, err)
		}
	}()

	// Wait briefly for status change
	for i := 0; i < 10; i++ {
		if inst.Status() == instance.StatusRunning {
			break
		}
		timeSleep(1)
	}
	if inst.Status() != instance.StatusRunning {
		w.WriteHeader(http.StatusInternalServerError)
		resp = fmt.Sprintf("Failed to start instance %s", inst.Metadata().Name)
		return
	}
	broadcastInstanceEvent("instance_status_changed", inst)
	resp = fmt.Sprintf("Instance %s started", inst.Metadata().Name)
}

func StopInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var resp interface{}
	defer func() { WriteResponse(w, resp) }()
	inst, err := getInstanceFromRequest(r)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		resp = err.Error()
		return
	}
	if inst.Status() != instance.StatusRunning {
		w.WriteHeader(http.StatusConflict)
		resp = "Server is not running"
		return
	}
	if err := inst.Stop(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		resp = fmt.Sprintf("Error stopping: %v", err)
		return
	}
	broadcastInstanceEvent("instance_status_changed", inst)
	resp = fmt.Sprintf("Instance %s stopped", inst.Metadata().Name)
}

func KillInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	var resp interface{}
	defer func() { WriteResponse(w, resp) }()
	inst, err := getInstanceFromRequest(r)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		resp = err.Error()
		return
	}
	if inst.Status() != instance.StatusRunning {
		w.WriteHeader(http.StatusConflict)
		resp = "Server is not running"
		return
	}
	if err := inst.Kill(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		resp = fmt.Sprintf("Error killing: %v", err)
		return
	}
	broadcastInstanceEvent("instance_status_changed", inst)
	resp = fmt.Sprintf("Instance %s killed", inst.Metadata().Name)
}

func InstanceStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	inst, err := getInstanceFromRequest(r)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	m := inst.Metadata()
	srv := inst.Server()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"name": m.Name, "display_name": m.DisplayName,
		"status": inst.Status().String(), "running": inst.Status() == instance.StatusRunning,
		"factorio_version": m.FactorioVersion, "game_port": m.GamePort,
		"rcon_port": m.RconPort, "bind_ip": m.BindIP, "savefile": srv.Savefile,
	})
}
```

**验证:** `go build ./src/api/` — 应无编译错误。

---

### 2.3 创建 `src/api/instance_helpers.go` — 中间件 + 广播

**文件:** `src/api/instance_helpers.go` (新建)

```go
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

type contextKey string

const instanceKey contextKey = "instance"

func InstanceMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		name := vars["name"]
		if name == "" {
			name = r.URL.Query().Get("name")
		}
		inst, ok := instanceManager.Get(name)
		if !ok {
			http.Error(w, fmt.Sprintf("instance %q not found", name), http.StatusNotFound)
			return
		}
		ctx := context.WithValue(r.Context(), instanceKey, inst)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func InstanceServerOffMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inst, ok := r.Context().Value(instanceKey).(*instance.Instance)
		if !ok {
			http.Error(w, "no instance in context", http.StatusInternalServerError)
			return
		}
		if inst.Status() == instance.StatusRunning || inst.Status() == instance.StatusStarting {
			http.Error(w, "server still running for this instance", http.StatusLocked)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func broadcastInstanceEvent(event string, inst *instance.Instance) {
	m := inst.Metadata()
	data, _ := json.Marshal(map[string]interface{}{
		"event": event, "name": m.Name, "display_name": m.DisplayName, "status": inst.Status().String(),
	})
	room := websocket.WebsocketHub.GetRoom("instances")
	room.Send(string(data))
}

// timeSleep allows mocking in tests.
var timeSleep = time.Sleep
```

需要在 import 中添加 `"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"` 和 `"github.com/OpenFactorioServerManager/factorio-server-manager/instance"`。

**验证:** `go build ./src/api/` — 应无编译错误。

---

### 2.4 更新 `src/api/routes.go` — 添加实例路由

**文件:** `src/api/routes.go` (修改)

**变更 A:** 在 `NewRouter()` 函数中, 在 `for _, route := range apiRoutes` 循环之前, 添加实例管理路由:

在 `apiRouter.NewRoute().Subrouter()` (现有代码第 49 行) 之后, `for _, route := range apiRoutes` 之前插入:

```go
	// Instance management routes
	apiRouter.Methods("GET").Path("/instances").Name("ListInstances").HandlerFunc(ListInstances)
	apiRouter.Methods("POST").Path("/instances").Name("CreateInstance").HandlerFunc(CreateInstance)
	apiRouter.Methods("DELETE").Path("/instances/{name}").Name("DeleteInstance").HandlerFunc(DeleteInstance)
	apiRouter.Methods("POST").Path("/instances/repair").Name("RepairInstance").HandlerFunc(RepairInstance)
	apiRouter.Methods("POST").Path("/instances/check-port").Name("CheckPortConflict").HandlerFunc(CheckPortConflict)
	apiRouter.Methods("GET").Path("/instances/{name}").Name("GetInstance").HandlerFunc(GetInstance)

	// Instance-scoped subrouter with InstanceMiddleware
	instanceRouter := apiRouter.PathPrefix("/instance/{name}").Subrouter()
	instanceRouter.Use(InstanceMiddleware)

	// Instance operations
	instanceRouter.Methods("POST").Path("/start").Name("StartInstance").HandlerFunc(StartInstance)
	instanceRouter.Methods("POST").Path("/stop").Name("StopInstance").HandlerFunc(StopInstance)
	instanceRouter.Methods("POST").Path("/kill").Name("KillInstance").HandlerFunc(KillInstance)
	instanceRouter.Methods("GET").Path("/status").Name("InstanceStatus").HandlerFunc(InstanceStatus)
	instanceRouter.Methods("GET").Path("/saves/list").Name("ListInstanceSaves").HandlerFunc(ListSaves)
	instanceRouter.Methods("GET").Path("/saves/dl/{save}").Name("DLInstanceSave").HandlerFunc(DLSave)
	instanceRouter.Methods("POST").Path("/saves/upload").Name("UploadInstanceSave").HandlerFunc(UploadSave)
	instanceRouter.Methods("GET").Path("/saves/rm/{save}").Name("RemoveInstanceSave").HandlerFunc(RemoveSave)
	instanceRouter.Methods("GET").Path("/saves/create/{save}").Name("CreateInstanceSave").HandlerFunc(CreateSaveHandler).Middleware(InstanceServerOffMiddleware)
	instanceRouter.Methods("GET").Path("/settings").Name("GetInstanceSettings").HandlerFunc(GetServerSettings)
	instanceRouter.Methods("POST").Path("/settings/update").Name("UpdateInstanceSettings").HandlerFunc(UpdateServerSettings)
	instanceRouter.Methods("GET").Path("/log/tail").Name("InstanceLogTail").HandlerFunc(LogTail)
	instanceRouter.Methods("GET").Path("/config").Name("InstanceLoadConfig").HandlerFunc(LoadConfig)
	instanceRouter.Methods("GET").Path("/version/current").Name("InstanceVersionCurrent").HandlerFunc(GetCurrentVersion)
	instanceRouter.Methods("GET").Path("/version/available").Name("InstanceVersionAvailable").HandlerFunc(GetAvailableVersions)
	instanceRouter.Methods("GET").Path("/version/list").Name("InstanceVersionList").HandlerFunc(GetFullVersionList)
	instanceRouter.Methods("POST").Path("/version/install").Name("InstanceVersionInstall").HandlerFunc(InstallVersion).Middleware(InstanceServerOffMiddleware)
	instanceRouter.Methods("GET").Path("/version/install-status").Name("InstanceVersionInstallStatus").HandlerFunc(GetInstallStatus)
	instanceRouter.Methods("GET").Path("/mods/list").Name("ListInstanceMods").HandlerFunc(ListInstalledModsHandler)
	instanceRouter.Methods("POST").Path("/mods/toggle").Name("ToggleInstanceMod").HandlerFunc(ModToggleHandler)
	instanceRouter.Methods("POST").Path("/mods/delete").Name("DeleteInstanceMod").HandlerFunc(ModDeleteHandler)
	instanceRouter.Methods("POST").Path("/mods/delete/all").Name("DeleteAllInstanceMods").HandlerFunc(ModDeleteAllHandler)
	instanceRouter.Methods("POST").Path("/mods/update").Name("UpdateInstanceMod").HandlerFunc(ModUpdateHandler)
	instanceRouter.Methods("POST").Path("/mods/upload").Name("UploadInstanceMod").HandlerFunc(ModUploadHandler)
	instanceRouter.Methods("GET").Path("/mods/download").Name("DownloadInstanceMods").HandlerFunc(ModDownloadHandler)
```

在 import 中添加 `"github.com/gorilla/mux"` (如果还没有), `"strings"`, `"log"`, `"time"`.

**变更 B:** 在文件末尾添加 `legacyRedirect` 函数:

```go
// legacyRedirect returns a handler that issues 308 redirect for backward compat.
func legacyRedirect(targetPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resolvedPath := targetPath
		for k, v := range mux.Vars(r) {
			resolvedPath = strings.ReplaceAll(resolvedPath, "{"+k+"}", v)
		}
		log.Printf("Legacy endpoint %s -> 308 to %s", r.URL.Path, resolvedPath)
		http.Redirect(w, r, resolvedPath, http.StatusPermanentRedirect)
	}
}
```

**验证:** `go build ./src/api/` — 应无编译错误。

---

### 2.5 添加后端互斥 — `src/api/handlers.go` 添加 import

**文件:** `src/api/handlers.go` (修改)

在 import 块中添加:
```go
"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
```

**验证:** `go build ./src/api/` — 应无编译错误。

---

### 2.6 创建实例范围的 save/settings/log 路由 wrapper

为了确保 `/api/instance/{name}/saves/list` 等端点使用实例特定的路径,需要创建 thin wrapper handlers,在调用现有 handler 前临时替换全局配置中的对应路径。

**文件:** 将这些 wrapper 追加到 `src/api/instance_handler.go`:

在文件末尾添加:

```go
// ===== Instance-scoped wrapper handlers =====

// wrapInstanceSavesHandler wraps a save handler to use the instance's saves directory.
func wrapInstanceSavesHandler(fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inst, ok := r.Context().Value(instanceKey).(*instance.Instance)
		if !ok {
			http.Error(w, "no instance in context", http.StatusInternalServerError)
			return
		}
		// Temporarily redirect global config to instance saves dir
		globalCfg := bootstrap.GetConfig()
		origSavesDir := globalCfg.FactorioSavesDir
		globalCfg.FactorioSavesDir = inst.Server().SavesDir()
		defer func() { globalCfg.FactorioSavesDir = origSavesDir }()
		fn(w, r)
	}
}

// ListInstanceSaves uses the instance's saves directory.
var ListInstanceSaves = wrapInstanceSavesHandler(ListSaves)
var DLInstanceSave = wrapInstanceSavesHandler(DLSave)
var UploadInstanceSave = wrapInstanceSavesHandler(UploadSave)
var RemoveInstanceSave = wrapInstanceSavesHandler(RemoveSave)
var CreateInstanceSave = wrapInstanceSavesHandler(CreateSaveHandler)

// wrapInstanceConfigHandler wraps a settings/log handler to use the instance's config dir.
func wrapInstanceConfigHandler(fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inst, ok := r.Context().Value(instanceKey).(*instance.Instance)
		if !ok {
			http.Error(w, "no instance in context", http.StatusInternalServerError)
			return
		}
		globalCfg := bootstrap.GetConfig()
		origSettings := globalCfg.SettingsFile
		origConfigDir := globalCfg.FactorioConfigDir
		origAdminFile := globalCfg.FactorioAdminFile
		origBinary := globalCfg.FactorioBinary
		origLog := globalCfg.FactorioLog
		origConsoleLog := globalCfg.ConsoleLogFile

		globalCfg.SettingsFile = inst.Server().SettingsFile()
		globalCfg.FactorioConfigDir = inst.Server().ConfigDir()
		globalCfg.FactorioAdminFile = filepath.Join(inst.Server().ConfigDir(), "server-adminlist.json")
		globalCfg.FactorioBinary = inst.Server().BinaryPath()
		globalCfg.FactorioLog = filepath.Join(inst.Server().ConfigDir(), "factorio-current.log")
		globalCfg.ConsoleLogFile = inst.Server().ConsoleLog()

		defer func() {
			globalCfg.SettingsFile = origSettings
			globalCfg.FactorioConfigDir = origConfigDir
			globalCfg.FactorioAdminFile = origAdminFile
			globalCfg.FactorioBinary = origBinary
			globalCfg.FactorioLog = origLog
			globalCfg.ConsoleLogFile = origConsoleLog
		}()
		fn(w, r)
	}
}

var GetInstanceSettings = wrapInstanceConfigHandler(GetServerSettings)
var UpdateInstanceSettings = wrapInstanceConfigHandler(UpdateServerSettings)
var InstanceLogTail = wrapInstanceConfigHandler(LogTail)
var InstanceLoadConfig = wrapInstanceConfigHandler(LoadConfig)
```

在 import 中添加 `"path/filepath"` 和 `"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"`.

同时需要在 `src/factorio/server.go` 中添加以下 getter 方法:

```go
func (s *Server) SavesDir() string    { return s.config.SavesDir }
func (s *Server) ConfigDir() string   { return s.config.ConfigDir }
func (s *Server) BinaryPath() string  { return s.config.BinaryPath }
func (s *Server) ConsoleLog() string  { return s.config.ConsoleLog }
func (s *Server) SettingsFile() string { return s.config.SettingsFile }
```

**验证:** `go build ./src/api/` — 应无编译错误。

---

## Phase 3: WebSocket 隔离 (3.1–3.3)

### 3.1 更新 `src/api/websocket/wshub.go` — 添加 `instances` 全局房间支持

**文件:** `src/api/websocket/wshub.go` (修改)

**变更:** 在 import 中添加 `"strings"`.

更新 `wsRoom.run()` 中 `room.name == "gamelog"` 的判断改为 `strings.HasSuffix`:

`oldString:`
```go
		// some hardcoded stuff for gamelog room
		if room.name == "gamelog" {
			// send cached log to registered client
			for _, logLine := range LogCache {
				client.send <- wsMessage{
					RoomName: "gamelog",
					Message:  logLine,
				}
			}
		}
```
`newString:`
```go
		if strings.HasSuffix(room.name, "/gamelog") {
			for _, logLine := range LogCache {
				client.send <- wsMessage{
					RoomName: room.name,
					Message:  logLine,
				}
			}
		}
```

以及:
`oldString:`
```go
		// some hardcoded stuff for gamelog room
		if room.name == "gamelog" {
			// add the line to the cache
			LogCache = append(LogCache, message.Message.(string))
```
`newString:`
```go
		if strings.HasSuffix(room.name, "/gamelog") {
			LogCache = append(LogCache, message.Message.(string))
```

**验证:** `go build ./src/api/websocket/` — 应无编译错误。

---

### 3.2 更新 `src/factorio/version_manager.go` — 实例化 VersionManager

**文件:** `src/factorio/version_manager.go` (修改)

在 `VersionManager` 结构体添加 `InstanceName` 字段:
`oldString:` `type VersionManager struct {\n\tFactorioDir    string\n\tFactorioBinary string\n\tCredentials    *Credentials\n}`
`newString:`
```go
type VersionManager struct {
	FactorioDir    string
	FactorioBinary string
	Credentials    *Credentials
	InstanceName   string
}
```

**验证:** `go build ./src/factorio/` — 应无编译错误。

---

### 3.3 更新 `src/factorio/version_manager.go` — 实例化的 WebSocket 房间

**文件:** `src/factorio/version_manager.go` (修改)

在 `DownloadAndInstall` 方法中, 找到 `GetRoom("server_version")` 的调用位置。需要将 `InstanceName` 融入房间名:

搜索代码中的:
```go
wsRoom := websocket.WebsocketHub.GetRoom("server_version")
```

将其替换为:
```go
roomName := "server_version"
if vm.InstanceName != "" {
	roomName = fmt.Sprintf("instance/%s/server_version", vm.InstanceName)
}
wsRoom := websocket.WebsocketHub.GetRoom(roomName)
```

在 import 中添加 `"fmt"`。

**验证:** `go build ./src/factorio/` — 应无编译错误。

---

### 3.4 标记 mod 文件中的 WebSocket 房间

**文件:** `src/factorio/mod_Mods.go` (修改)

在文件顶部, `var FileLock lockfile.FileLock` 之后添加注释:
```go
// TODO(multi-instance): Update WebSocket room references in this file to use
// instance-prefixed room names once mod operations become instance-scoped.
```

**验证:** `go build ./src/factorio/` — 应无编译错误。

---

## Phase 4: 前端 (4.1–4.12)

### 4.1 创建 `ui/App/context/InstanceProvider.jsx`

**文件:** `ui/App/context/InstanceProvider.jsx` (新建)

```jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../../api/socket';

const InstanceContext = createContext(null);

export function InstanceProvider({ children }) {
    const { name } = useParams();
    const [instance, setInstance] = useState(null);
    const [instanceStatus, setInstanceStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (name) => {
        setLoading(true);
        try {
            const [instResp, statusResp] = await Promise.all([
                fetch(`/api/instances/${name}`),
                fetch(`/api/instance/${name}/status`)
            ]);
            if (instResp.ok) setInstance(await instResp.json());
            if (statusResp.ok) setInstanceStatus(await statusResp.json());
        } catch (err) {
            console.error('Failed to fetch instance:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (name) fetchData(name);
        else setLoading(false);
    }, [name, fetchData]);

    useEffect(() => {
        if (!name) return;
        const room = `instance/${name}/server_status`;
        socket.subscribe(room);
        const handler = (data) => {
            try { setInstanceStatus(JSON.parse(data)); } catch (e) {}
        };
        socket.on(room, handler);
        return () => {
            socket.unsubscribe(room);
            socket.off(room, handler);
        };
    }, [name]);

    return (
        <InstanceContext.Provider value={{ instance, instanceStatus, loading }}>
            {children}
        </InstanceContext.Provider>
    );
}

export function useInstance() {
    const ctx = useContext(InstanceContext);
    if (!ctx) throw new Error('useInstance must be used within InstanceProvider');
    return ctx;
}

export default InstanceContext;
```

---

### 4.2 创建 `ui/App/views/InstanceList.jsx`

**文件:** `ui/App/views/InstanceList.jsx` (新建)

```jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Panel from '../components/Panel';
import socket from '../../api/socket';

const InstanceList = () => {
    const navigate = useNavigate();
    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchInstances = async () => {
        try {
            const res = await fetch('/api/instances');
            if (res.ok) setInstances(await res.json());
        } catch (err) {
            console.error('Failed to fetch instances:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInstances(); }, []);

    useEffect(() => {
        socket.subscribe('instances');
        const handler = () => fetchInstances();
        socket.on('instances', handler);
        return () => { socket.unsubscribe('instances'); socket.off('instances', handler); };
    }, []);

    const handleStart = async (name, e) => {
        e.stopPropagation();
        await fetch(`/api/instance/${name}/start`, { method: 'POST' });
        fetchInstances();
    };
    const handleStop = async (name, e) => {
        e.stopPropagation();
        await fetch(`/api/instance/${name}/stop`, { method: 'POST' });
        fetchInstances();
    };
    const statusColor = (s) => {
        switch (s) {
            case 'running': return 'bg-green';
            case 'starting': case 'stopping': return 'bg-yellow';
            case 'error': return 'bg-gray';
            default: return 'bg-red';
        }
    };

    if (loading) return <div className="text-center py-8 text-gray-light">Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl text-dirty-white font-bold">Instances</h1>
                <div className="flex gap-2">
                    <Link to="/instances/create"><Button size="sm" type="success">+ Create</Button></Link>
                    <Link to="/instances/import-save"><Button size="sm" type="default">Import Save</Button></Link>
                </div>
            </div>
            {instances.length === 0 ? (
                <Panel title="No Instances" content={
                    <div className="text-center py-8">
                        <p className="text-gray-light mb-4">Create your first Factorio server instance.</p>
                        <Link to="/instances/create"><Button type="success">Create First Instance</Button></Link>
                    </div>
                }/>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map(inst => (
                        <div key={inst.name} className="accentuated rounded-sm bg-gray-dark p-4 cursor-pointer hover:bg-gray-medium transition-colors"
                            onClick={() => navigate(`/instance/${inst.name}`)}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-dirty-white font-bold text-lg">{inst.display_name || inst.name}</h3>
                                    <div className="text-gray-light text-xs">{inst.name}</div>
                                </div>
                                <div className={`${statusColor(inst.status)} rounded-full px-3 py-1 text-xs text-black font-bold`}>
                                    {inst.status}
                                </div>
                            </div>
                            <div className="text-sm text-gray-light space-y-1">
                                <div>Version: {inst.factorio_version || '—'}</div>
                                <div>Port: {inst.game_port}</div>
                                <div>RCON: {inst.rcon_port}</div>
                            </div>
                            <div className="flex gap-2 mt-3">
                                {inst.status === 'running' ? (
                                    <Button size="sm" type="danger" onClick={(e) => handleStop(inst.name, e)}>Stop</Button>
                                ) : (
                                    <Button size="sm" type="success" onClick={(e) => handleStart(inst.name, e)}>Start</Button>
                                )}
                                <Button size="sm" type="default" onClick={() => navigate(`/instance/${inst.name}`)}>Enter</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
export default InstanceList;
```

---

### 4.3 创建 `ui/App/views/InstanceCreate.jsx`

**文件:** `ui/App/views/InstanceCreate.jsx` (新建)

```jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '../components/Panel';
import Button from '../components/Button';
import Input from '../components/Input';
import Error from '../components/Error';
import { useForm } from 'react-hook-form';

const InstanceCreate = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const { handleSubmit, register, formState: { errors }, watch } = useForm();

    const onSubmit = async (data) => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: data.name, display_name: data.display_name || data.name, game_port: parseInt(data.game_port) || 34197 })
            });
            if (res.ok) {
                const result = await res.json();
                navigate(`/instance/${result.name}`);
            } else {
                setError(await res.text());
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl text-dirty-white font-bold mb-6">Create Instance</h1>
            <div className="flex mb-6">
                <div className={`flex-1 text-center py-2 ${step === 1 ? 'bg-orange text-black' : 'bg-gray-dark text-gray-light'}`}>1. Configure</div>
                <div className={`flex-1 text-center py-2 ${step >= 2 ? 'bg-orange text-black' : 'bg-gray-dark text-gray-light'}`}>2. Confirm</div>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
                <Panel title={step === 1 ? 'Configure Instance' : 'Confirm Settings'}
                    content={step === 1 ? (
                        <div className="space-y-4">
                            <div>
                                <div className="font-bold text-sm mb-1">Name *</div>
                                <Input placeholder="my-server" register={register('name', { required: true, pattern: /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/, minLength: 1, maxLength: 64 })} />
                                <Error error={errors.name} message="Lowercase alphanumeric with hyphens (1-64 chars)" />
                            </div>
                            <div>
                                <div className="font-bold text-sm mb-1">Display Name</div>
                                <Input placeholder="My Server" register={register('display_name')} />
                            </div>
                            <div>
                                <div className="font-bold text-sm mb-1">Game Port</div>
                                <Input type="number" defaultValue="34197" min={1024} max={65535} register={register('game_port', { min: 1024, max: 65535 })} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 text-sm">
                            <div><span className="text-gray-light">Name:</span> <span className="text-dirty-white">{watch('name')}</span></div>
                            <div><span className="text-gray-light">Display Name:</span> <span className="text-dirty-white">{watch('display_name') || watch('name')}</span></div>
                            <div><span className="text-gray-light">Port:</span> <span className="text-dirty-white">{watch('game_port') || 34197}</span></div>
                            {error && <div className="text-red-light font-bold">{error}</div>}
                        </div>
                    )}
                    actions={step === 1 ? (
                        <Button type="success" onClick={() => setStep(2)}>Next</Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button type="default" onClick={() => setStep(1)}>Back</Button>
                            <Button isSubmit type="success" isLoading={creating}>Create</Button>
                        </div>
                    )}
                />
            </form>
        </div>
    );
};
export default InstanceCreate;
```

---

### 4.4 创建 `ui/App/components/InstanceSwitcher.jsx`

**文件:** `ui/App/components/InstanceSwitcher.jsx` (新建)

```jsx
import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';

const InstanceSwitcher = () => {
    const { name: currentName } = useParams();
    const [isOpen, setIsOpen] = useState(false);
    const [instances, setInstances] = useState([]);
    const ref = useRef(null);

    useEffect(() => {
        fetch('/api/instances').then(r => r.ok ? r.json() : []).then(setInstances).catch(() => {});
    }, [currentName]);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const current = instances.find(i => i.name === currentName);
    const dotColor = (s) => {
        switch (s) { case 'running': return 'bg-green'; case 'starting': case 'stopping': return 'bg-yellow'; case 'error': return 'bg-gray'; default: return 'bg-red'; }
    };

    return (
        <div className="relative" ref={ref}>
            <button className="w-full bg-gray-medium text-dirty-white rounded-sm px-3 py-2 text-left flex items-center justify-between hover:bg-gray-light"
                onClick={() => setIsOpen(!isOpen)}>
                <span className="font-bold truncate">{current?.display_name || current?.name || currentName || '...'}</span>
                <span className="text-xs ml-2">▼</span>
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-dark border border-gray-medium rounded-sm shadow-lg z-50">
                    {instances.map(inst => (
                        <Link key={inst.name} to={`/instance/${inst.name}`}
                            className={`flex items-center justify-between px-3 py-2 hover:bg-gray-medium text-dirty-white text-sm ${inst.name === currentName ? 'bg-gray-medium' : ''}`}
                            onClick={() => setIsOpen(false)}>
                            <span className="truncate">{inst.display_name || inst.name}</span>
                            <span className={`${dotColor(inst.status)} w-2 h-2 rounded-full flex-shrink-0 ml-2`}></span>
                        </Link>
                    ))}
                    <div className="border-t border-gray-medium mt-1 pt-1">
                        <Link to="/instances" className="block px-3 py-2 text-gray-light text-sm hover:text-dirty-white" onClick={() => setIsOpen(false)}>
                            ← All Instances
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
export default InstanceSwitcher;
```

---

### 4.5 更新 `ui/App/App.jsx` — 重构路由

**文件:** `ui/App/App.jsx` (修改)

完整新内容:

```jsx
import React, {useCallback, useState} from 'react';
import user from "../api/resources/user";
import Login from "./views/Login";
import {Navigate, Route, Routes} from "react-router";
import Controls from "./views/Controls";
import {BrowserRouter, Outlet} from "react-router-dom";
import Logs from "./views/Logs";
import Saves from "./views/Saves/Saves";
import Layout from "./components/Layout";
import Mods from "./views/Mods/Mods";
import UserManagement from "./views/UserManagement/UserManagment";
import ServerSettings from "./views/ServerSettings";
import Console from "./views/Console";
import Help from "./views/Help";
import ServerVersion from "./views/ServerVersion";
import EventLog from "./views/EventLog";
import InstanceList from "./views/InstanceList";
import InstanceCreate from "./views/InstanceCreate";
import {InstanceProvider} from "./context/InstanceProvider";
import {Flash} from "./components/Flash";
import "./i18n";

const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const handleAuthenticationStatus = useCallback(async (status) => {
        if (status?.username) setIsAuthenticated(true);
    }, []);
    const handleLogout = useCallback(async () => {
        const loggedOut = await user.logout();
        if (loggedOut) setIsAuthenticated(false);
    }, []);

    const ProtectedRoute = ({isAuthenticated}) => {
        if (!isAuthenticated) return <Navigate to="/login" state={{from: window.location.pathname}} />;
        return <Outlet/>;
    };

    return (
        <BrowserRouter>
            <Routes>
                <Route path="login" element={<Login handleLogin={handleAuthenticationStatus}/>}/>
                <Route element={<ProtectedRoute isAuthenticated={isAuthenticated}/>}>
                    <Route path="instances" element={<InstanceList/>}/>
                    <Route path="instances/create" element={<InstanceCreate/>}/>
                    <Route path="instance/:name" element={<InstanceProvider><Layout handleLogout={handleLogout}/></InstanceProvider>}>
                        <Route index element={<Controls/>}/>
                        <Route path="saves" element={<Saves/>}/>
                        <Route path="mods" element={<Mods/>}/>
                        <Route path="server-settings" element={<ServerSettings/>}/>
                        <Route path="console" element={<Console/>}/>
                        <Route path="logs" element={<Logs/>}/>
                        <Route path="server-version" element={<ServerVersion/>}/>
                        <Route path="event-log" element={<EventLog/>}/>
                    </Route>
                    <Route element={<Layout handleLogout={handleLogout}/>}>
                        <Route path="user-management" element={<UserManagement/>}/>
                        <Route path="help" element={<Help/>}/>
                    </Route>
                    <Route index element={<Navigate to="/instances" replace/>}/>
                </Route>
            </Routes>
        </BrowserRouter>
    );
};
export default App;
```

---

### 4.6 更新 `ui/App/components/Layout.jsx` — 添加 InstanceSwitcher

**文件:** `ui/App/components/Layout.jsx` (修改)

**变更 A:** 更新 prop 声明和 import:
`oldString:` `import {NavLink, Outlet} from "react-router-dom";`
`newString:`
```jsx
import {NavLink, Outlet, useParams} from "react-router-dom";
import InstanceSwitcher from './InstanceSwitcher';
import { useInstance } from '../context/InstanceProvider';
```

`oldString:` `const Layout = ({handleLogout, serverStatus}) => {`
`newString:`
```jsx
const Layout = ({handleLogout}) => {
    const { instanceStatus, instance } = useInstance();
    const serverStatus = instanceStatus || {};
    const params = useParams();
    const currentName = instance?.name || params.name || 'default';
```

**变更 B:** 将 status 区域替换为 InstanceSwitcher:
`oldString:`
```jsx
<h1 className="text-dirty-white text-lg mb-2 mx-4">{t("server_status")}</h1>
<div className="mx-4 mb-4 text-center">
    <Status info={serverStatus}/>
</div>
```
`newString:`
```jsx
<h1 className="text-dirty-white text-lg mb-2 mx-4">{t("server_status")}</h1>
<div className="mx-4 mb-2">
    <InstanceSwitcher/>
</div>
<div className="mx-4 mb-4 text-center">
    <Status info={serverStatus}/>
</div>
```

**变更 C:** 更新侧边栏链接:
`oldString:`
```jsx
<Link to="/">{t("controls.title")}</Link>
<Link to="/saves">{t("saves.title")}</Link>
<Link to="/mods">{t("mods.title")}</Link>
<Link to="/server-version">{t("serverVersion.title")}</Link>
<Link to="/server-settings">{t("server_settings.title")}</Link>
<Link to="/console">{t("console.title")}</Link>
```
`newString:`
```jsx
<Link to={`/instance/${currentName}`}>{t("controls.title")}</Link>
<Link to={`/instance/${currentName}/saves`}>{t("saves.title")}</Link>
<Link to={`/instance/${currentName}/mods`}>{t("mods.title")}</Link>
<Link to={`/instance/${currentName}/server-version`}>{t("serverVersion.title")}</Link>
<Link to={`/instance/${currentName}/server-settings`}>{t("server_settings.title")}</Link>
<Link to={`/instance/${currentName}/console`}>{t("console.title")}</Link>
```

以及:
`oldString:` `<Link to="/event-log" last={true}>事件日志</Link>`
`newString:` `<Link to={`/instance/${currentName}/event-log`} last={true}>事件日志</Link>`

---

### 4.7 更新 `ui/App/views/Controls.jsx` — 使用 useInstance

**文件:** `ui/App/views/Controls.jsx` (修改)

**变更:** 替换 prop 声明:
`oldString:` `const Controls = ({serverStatus}) => {`
`newString:`
```jsx
import { useInstance } from '../../context/InstanceProvider';

const Controls = () => {
    const { instanceStatus } = useInstance();
    const serverStatus = instanceStatus || {};
```

**验证:** `cd ui && npm run build` — 应无编译错误。

---

### 4.8 更新其他视图 — 全面替换 serverStatus prop

对所有视图文件执行相同的模式:

| 文件 | 替换 serverStatus prop 为 useInstance() |
|---|---|
| `ui/App/views/Saves/Saves.jsx` | `serverStatus` → `useInstance()` |
| `ui/App/views/Mods/Mods.jsx` | 同上 |
| `ui/App/views/ServerSettings.jsx` | 同上 |
| `ui/App/views/Console.jsx` | 同上 + WS room → `instance/{name}/gamelog` |
| `ui/App/views/Logs.jsx` | 同上 |
| `ui/App/views/ServerVersion.jsx` | 同上 + API paths → instance-scoped |
| `ui/App/views/EventLog.jsx` | 同上 |

每个文件的具体替换操作:
1. 在 import 中添加 `import { useInstance } from '../../context/InstanceProvider';`
2. 将 `({serverStatus})` 替换为 `()`
3. 在函数体添加 `const { instanceStatus, instance } = useInstance(); const serverStatus = instanceStatus || {};`

---

### 4.9 更新 `ui/api/socket.js` — 动态房间订阅

**文件:** `ui/api/socket.js` (修改)

**变更 A:** 添加 `dynamicSubscribe` 和 `dynamicUnsubscribe`:

在 `roomSubs` 对象(第 59 行)之后添加:
```js
function dynamicSubscribe(room) {
    if (!activeRooms.has(room)) {
        activeRooms.add(room);
        socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: room}}));
    }
}
function dynamicUnsubscribe(room) {
    if (activeRooms.has(room)) {
        activeRooms.delete(room);
        socket.send(JSON.stringify({room_name: "", controls: {type: "unsubscribe", value: room}}));
    }
}
```

**变更 B:** 更新 `resubscribeAll`:
`oldString:`
```js
function resubscribeAll() {
    for (const room of activeRooms) {
        const fn = roomSubs[room];
        if (fn) fn();
    }
}
```
`newString:`
```js
function resubscribeAll() {
    for (const room of activeRooms) {
        const fn = roomSubs[room];
        if (fn) fn();
        else {
            socket.send(JSON.stringify({room_name: "", controls: {type: "subscribe", value: room}}));
        }
    }
}
```

**变更 C:** 在 export 前添加公共接口:
```js
bus.subscribe = dynamicSubscribe;
bus.unsubscribe = dynamicUnsubscribe;
```

---

### 4.10 创建 `ui/api/resources/instance.js`

**文件:** `ui/api/resources/instance.js` (新建)

```js
import client from "../client";

export default {
    list: async () => { const r = await client.get('/api/instances'); return r.data; },
    get: async (name) => { const r = await client.get(`/api/instances/${name}`); return r.data; },
    create: async (data) => { const r = await client.post('/api/instances', data); return r.data; },
    delete: async (name) => { const r = await client.delete(`/api/instances/${name}`); return r.data; },
    repair: async (name) => { const r = await client.post('/api/instances/repair', { name }); return r.data; },
    checkPort: async (port) => { const r = await client.post('/api/instances/check-port', { port }); return r.data; },
    status: async (name) => { const r = await client.get(`/api/instance/${name}/status`); return r.data; },
    start: async (name) => { const r = await client.post(`/api/instance/${name}/start`); return r.data; },
    stop: async (name) => { const r = await client.post(`/api/instance/${name}/stop`); return r.data; },
    kill: async (name) => { const r = await client.post(`/api/instance/${name}/kill`); return r.data; }
};
```

---

### 4.11 更新 `ui/api/resources/server.js` — 添加 instance-scoped 方法

**文件:** `ui/api/resources/server.js` (修改)

在 `version` 对象末尾添加(在最后一个 `}` 之前):
```js
    // Instance-scoped methods
    instanceStart: async (name, ip, port, savefile) => {
        const r = await client.post(`/api/instance/${name}/start`, { bindip: ip, port, savefile });
        return r.data;
    },
    instanceStop: async (name) => {
        const r = await client.get(`/api/instance/${name}/stop`);
        return r.data;
    },
    instanceKill: async (name) => {
        const r = await client.get(`/api/instance/${name}/kill`);
        return r.data;
    },
    instanceStatus: async (name) => {
        const r = await client.get(`/api/instance/${name}/status`);
        return r.data;
    }
```

---

### 4.12 国际化文件

**文件:** `ui/locales/en/instance.json` (新建)
```json
{"title":"Instances","createTitle":"Create Instance","importTitle":"Import from Save","noInstances":"No Instances","noInstancesDesc":"Create your first Factorio server instance to get started.","createFirst":"Create First Instance","create":"Create","import":"Import & Create","name":"Name","displayName":"Display Name","gamePort":"Game Port","version":"Version","status":"Status","running":"Running","stopped":"Stopped","start":"Start","stop":"Stop","enter":"Enter","allInstances":"All Instances","step1":"1. Configure","step2":"2. Confirm","configure":"Configure Instance","confirm":"Confirm Settings","next":"Next","back":"Back","nameRequired":"Lowercase alphanumeric with hyphens (1-64 chars)","portInvalid":"Port must be 1024-65535","loading":"Loading..."}
```

**文件:** `ui/locales/zh-CN/instance.json` (新建)
```json
{"title":"实例列表","createTitle":"创建实例","importTitle":"从存档导入","noInstances":"暂无实例","noInstancesDesc":"创建你的第一个 Factorio 服务器实例以开始使用。","createFirst":"创建第一个实例","create":"创建","name":"名称","displayName":"显示名称","gamePort":"游戏端口","version":"版本","status":"状态","running":"运行中","stopped":"已停止","start":"启动","stop":"停止","enter":"进入","allInstances":"所有实例","step1":"1. 配置","step2":"2. 确认","nameRequired":"小写字母数字加连字符（1-64 字符）","portInvalid":"端口必须在 1024-65535 之间","loading":"加载中..."}
```

**文件:** `ui/i18n.js` (修改)

在英文 import 后添加: `import enInstance from './locales/en/instance.json';`
在中文 import 后添加: `import zhInstance from './locales/zh-CN/instance.json';`

在 resources `en` 对象中添加: `instance: enInstance,`
在 resources `zh-CN` 对象中添加: `instance: zhInstance,`

---

## Phase 5: 构建验证 (5.1–5.3)

### 5.1 Go 编译验证

```bash
go build ./...
```
预期输出: 零错误。

### 5.2 前端构建验证

```bash
cd ui && npm run build
```
预期输出: 零错误, 产物在 `ui/dist/` 或 `ui/app/`。

### 5.3 最终手动检查清单

- [ ] 新旧文件均已创建/修改为上述规范
- [ ] 所有 import 路径正确
- [ ] `src/factorio/server.go` 中没有残留的 `GetFactorioServer()` 调用
- [ ] `src/main.go` 中没有残留的 `factorio.NewFactorioServer()` 调用
- [ ] 前端构建无 webpack/vite 错误

---

## 依赖顺序图

```
Phase 1 (后端核心)
  1.1 instance.go ──┐
  1.2 manager.go ───┤
  1.3 discovery.go ─┤
  1.4 server.go ────┤
  1.5 saves.go ─────┤
  1.6 config.go ────┼──> 1.7 main.go ──> 1.8 handlers.go ──> 1.9 migrate.go

Phase 2 (API)
  2.1 instance_handler.go ──┐
  2.2 operation_handler.go ──┼──> 2.3 helpers.go ──> 2.4 routes.go ──> 2.6 wrappers.go
  2.5 handlers.go import ────┘

Phase 3 (WebSocket)
  3.1 wshub.go ──── 3.2 version_manager.go ──── 3.3 version WS rooms ──── 3.4 mod_Mods.go

Phase 4 (前端)
  4.1 InstanceProvider ──┐
  4.2 InstanceList ──────┤
  4.3 InstanceCreate ────┤
  4.4 InstanceSwitcher ──┼──> 4.5 App.jsx ──> 4.6 Layout ──> 4.7–4.8 views
  4.9 socket.js ─────────┤
  4.10–4.12 api/i18n ────┘

Phase 5 (验证)
  5.1 go build ──── 5.2 npm run build ──── 5.3 manual checklist
```
