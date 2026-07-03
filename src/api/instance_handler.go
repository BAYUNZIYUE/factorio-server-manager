package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"regexp"

	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
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
	rconPort := instance.RandomPortRange(40000, 45000)
	for instanceManager.ByPort(rconPort) != nil {
		rconPort = instance.RandomPortRange(40000, 45000)
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

// ===== Instance-scoped wrapper handlers =====
// These wrapper handlers temporarily redirect global config paths to the
// instance-specific paths before calling the existing handler functions.
// This allows the legacy handler code (which reads from bootstrap.GetConfig())
// to operate on the correct instance without requiring per-handler refactoring.

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

// Instance-scoped save handler variables that use the instance's saves directory.
var ListInstanceSaves = wrapInstanceSavesHandler(ListSaves)
var DLInstanceSave = wrapInstanceSavesHandler(DLSave)
var UploadInstanceSave = wrapInstanceSavesHandler(UploadSave)
var RemoveInstanceSave = wrapInstanceSavesHandler(RemoveSave)
var CreateInstanceSave = wrapInstanceSavesHandler(CreateSaveHandler)

// wrapInstanceConfigHandler wraps a settings/log/config handler to use the instance's paths.
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
		origConfigFile := globalCfg.FactorioConfigFile

		globalCfg.SettingsFile = inst.Server().SettingsFile()
		globalCfg.FactorioConfigDir = inst.Server().ConfigDir()
		globalCfg.FactorioAdminFile = filepath.Join(inst.Server().ConfigDir(), "server-adminlist.json")
		globalCfg.FactorioBinary = inst.Server().BinaryPath()
		globalCfg.FactorioLog = filepath.Join(inst.Server().ConfigDir(), "factorio-current.log")
		globalCfg.ConsoleLogFile = inst.Server().ConsoleLog()
		globalCfg.FactorioConfigFile = filepath.Join(inst.Server().ConfigDir(), "config.ini")

		defer func() {
			globalCfg.SettingsFile = origSettings
			globalCfg.FactorioConfigDir = origConfigDir
			globalCfg.FactorioAdminFile = origAdminFile
			globalCfg.FactorioBinary = origBinary
			globalCfg.FactorioLog = origLog
			globalCfg.ConsoleLogFile = origConsoleLog
			globalCfg.FactorioConfigFile = origConfigFile
		}()
		fn(w, r)
	}
}

// Instance-scoped config handler variables that use the instance's config paths.
var GetInstanceSettings = wrapInstanceConfigHandler(GetServerSettings)
var UpdateInstanceSettings = wrapInstanceConfigHandler(UpdateServerSettings)
var InstanceLogTail = wrapInstanceConfigHandler(LogTail)
var InstanceLoadConfig = wrapInstanceConfigHandler(LoadConfig)
