package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
	"github.com/gorilla/mux"
)

// contextKey and instanceKey are used by InstanceMiddleware (defined in instance_helpers.go)
// to pass the resolved instance via request context.
type contextKey string

const instanceKey contextKey = "instance"

// timeSleep allows mocking in tests.
var timeSleep = time.Sleep

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
		timeSleep(1 * time.Second)
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
