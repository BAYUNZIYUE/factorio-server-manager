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
