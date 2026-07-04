package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/mux"
)

const templatesDir = "templates"

type Template struct {
	Name            string `json:"name"`
	FactorioVersion string `json:"factorio_version,omitempty"`
	Modpack         string `json:"modpack,omitempty"`
	GamePort        int    `json:"game_port"`
}

func listTemplates() ([]Template, error) {
	var result []Template
	entries, err := os.ReadDir(templatesDir)
	if err != nil {
		if os.IsNotExist(err) {
			return result, nil
		}
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(templatesDir, e.Name()))
		if err != nil {
			continue
		}
		var t Template
		if json.Unmarshal(data, &t) == nil {
			t.Name = e.Name()[:len(e.Name())-5] // strip .json
			result = append(result, t)
		}
	}
	return result, nil
}

func ListTemplates(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	templates, err := listTemplates()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(templates)
}

func CreateTemplateFromInstance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	vars := mux.Vars(r)
	inst, ok := instanceManager.Get(vars["name"])
	if !ok {
		http.Error(w, fmt.Sprintf("instance %q not found", vars["name"]), http.StatusNotFound)
		return
	}
	var body struct {
		TemplateName string `json:"template_name"`
	}
	if err := func() error {
		data, err := io.ReadAll(r.Body)
		if err != nil {
			return err
		}
		return json.Unmarshal(data, &body)
	}(); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.TemplateName == "" {
		body.TemplateName = inst.Metadata().Name
	}
	m := inst.Metadata()
	t := Template{
		Name:            body.TemplateName,
		FactorioVersion: m.FactorioVersion,
		Modpack:         m.Modpack,
		GamePort:        m.GamePort,
	}
	os.MkdirAll(templatesDir, 0755)
	data, _ := json.MarshalIndent(t, "", "  ")
	if err := os.WriteFile(filepath.Join(templatesDir, body.TemplateName+".json"), data, 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(t)
}

func DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	name := mux.Vars(r)["name"]
	path := filepath.Join(templatesDir, name+".json")
	if err := os.Remove(path); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}
