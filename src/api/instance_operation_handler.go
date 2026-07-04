package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
	"github.com/OpenFactorioServerManager/factorio-server-manager/jobqueue"
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

	job := jobqueue.GlobalQueue.Submit(fmt.Sprintf("启动 %s", inst.Metadata().Name), func(ctx context.Context, j *jobqueue.Job) error {
		j.SetProgress(10, "正在启动...")
		if err := inst.Start(); err != nil {
			return err
		}
		j.SetProgress(100, "启动完成")
		return nil
	})
	resp = fmt.Sprintf("Job %s: 启动任务已提交", job.ID)
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
