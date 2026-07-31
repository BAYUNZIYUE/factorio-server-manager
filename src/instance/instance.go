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
	Modpack         string    `json:"modpack,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Instance struct {
	metadata  InstanceMetadata
	server    *factorio.Server
	status    InstanceStatus
	statusMu  sync.RWMutex
	dir       string
	startedAt time.Time
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
	inst.statusMu.Lock()
	inst.startedAt = time.Now()
	inst.statusMu.Unlock()
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
	inst.startedAt = time.Time{}
	return nil
}

func (inst *Instance) Kill() error {
	err := inst.server.Kill()
	if err != nil {
		inst.SetStatus(StatusError)
		return err
	}
	inst.SetStatus(StatusStopped)
	inst.startedAt = time.Time{}
	return nil
}

func (inst *Instance) Uptime() int64 {
	inst.statusMu.RLock()
	defer inst.statusMu.RUnlock()
	if inst.startedAt.IsZero() {
		return 0
	}
	return int64(time.Since(inst.startedAt).Seconds())
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

func (inst *Instance) Server() *factorio.Server  { return inst.server }
func (inst *Instance) Metadata() InstanceMetadata { return inst.metadata }
func (inst *Instance) Dir() string                { return inst.dir }

func (inst *Instance) SaveMetadata() error {
	inst.metadata.UpdatedAt = time.Now().UTC()
	path := filepath.Join(inst.dir, "instance.json")
	data, err := json.MarshalIndent(inst.metadata, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (inst *Instance) ModsDir() string {
	if inst.metadata.Modpack != "" {
		return filepath.Join(filepath.Dir(inst.dir), "..", "mod_packs", inst.metadata.Modpack, "mods")
	}
	return filepath.Join(inst.dir, "mods")
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
