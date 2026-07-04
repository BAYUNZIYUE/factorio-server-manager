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
	Modpack     string
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
		Modpack:   opts.Modpack,
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

// GetRunningInstances returns instance info for all instances, satisfying factorio.InstanceAccessor.
func (m *InstanceManager) GetRunningInstances() []factorio.ServerInstanceInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]factorio.ServerInstanceInfo, 0, len(m.instances))
	for name, inst := range m.instances {
		list = append(list, factorio.ServerInstanceInfo{
			Name:   name,
			Server: inst.Server(),
		})
	}
	return list
}

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
