package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"
	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
)

func GetCurrentVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	vm := factorio.NewVersionManager()
	version, err := vm.GetCurrentVersion()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"version": version})
}

func GetAvailableVersions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	vm := factorio.NewVersionManager()
	releases, err := vm.GetAvailableVersions()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(releases)
}

func GetFullVersionList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	vm := factorio.NewVersionManager()
	releases, err := vm.GetFullVersionList()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(releases)
}

func InstallVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	var data struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	vm := factorio.NewVersionManager()
	wsRoom := websocket.WebsocketHub.GetRoom("server_version")

	err := vm.DownloadAndInstall(data.Version, func(percent int) {
		msg := fmt.Sprintf(`{"type":"download_progress","version":"%s","percent":%d}`, data.Version, percent)
		wsRoom.Send(string(msg))
	})

	if err != nil {
		log.Printf("Version install error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	wsRoom.Send(fmt.Sprintf(`{"type":"install_complete","version":"%s"}`, data.Version))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"version": data.Version,
	})
}
