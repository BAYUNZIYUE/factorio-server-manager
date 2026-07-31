package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

func ListGlobalSaves(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	type info struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
	}
	var result []info
	entries, err := os.ReadDir("saves")
	if err != nil {
		json.NewEncoder(w).Encode(result)
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ei, _ := e.Info()
		result = append(result, info{Name: e.Name(), Size: ei.Size()})
	}
	json.NewEncoder(w).Encode(result)
}

func CopyGlobalSaveToInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	name := r.URL.Query().Get("save")
	inst := r.URL.Query().Get("instance")
	if name == "" || inst == "" {
		http.Error(w, "missing save or instance param", http.StatusBadRequest)
		return
	}
	src := filepath.Join("saves", filepath.Base(name))
	dst := filepath.Join("instances", filepath.Base(inst), "saves", filepath.Base(name))
	os.MkdirAll(filepath.Dir(dst), 0755)
	data, err := os.ReadFile(src)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if err := os.WriteFile(dst, data, 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "copied", "to": dst})
}
