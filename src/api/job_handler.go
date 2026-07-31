package api

import (
	"encoding/json"
	"net/http"

	"github.com/OpenFactorioServerManager/factorio-server-manager/jobqueue"
	"github.com/gorilla/mux"
)

func ListJobs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	json.NewEncoder(w).Encode(jobqueue.GlobalQueue.List())
}

func CancelJob(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json;charset=UTF-8")
	id := mux.Vars(r)["id"]
	if jobqueue.GlobalQueue.Cancel(id) {
		json.NewEncoder(w).Encode(map[string]string{"status": "cancelled"})
	} else {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "job not found"})
	}
}
