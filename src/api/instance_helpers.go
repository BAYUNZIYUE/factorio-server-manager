package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"
	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
	"github.com/gorilla/mux"
)

// contextKey is used for request context values to avoid key collisions.
type contextKey string

// instanceKey is the context key under which the resolved *instance.Instance is stored.
const instanceKey contextKey = "instance"

// InstanceMiddleware extracts the instance name from the URL, looks it up,
// and attaches the resolved *instance.Instance to the request context.
func InstanceMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		name := vars["name"]
		if name == "" {
			name = r.URL.Query().Get("name")
		}
		inst, ok := instanceManager.Get(name)
		if !ok {
			http.Error(w, fmt.Sprintf("instance %q not found", name), http.StatusNotFound)
			return
		}
		ctx := context.WithValue(r.Context(), instanceKey, inst)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// InstanceServerOffMiddleware blocks requests when the instance's Factorio server is running.
func InstanceServerOffMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inst, ok := r.Context().Value(instanceKey).(*instance.Instance)
		if !ok {
			http.Error(w, "no instance in context", http.StatusInternalServerError)
			return
		}
		if inst.Status() == instance.StatusRunning || inst.Status() == instance.StatusStarting {
			http.Error(w, "server still running for this instance", http.StatusLocked)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// broadcastInstanceEvent sends an instance lifecycle event to the "instances" WebSocket room.
func broadcastInstanceEvent(event string, inst *instance.Instance) {
	m := inst.Metadata()
	data, _ := json.Marshal(map[string]interface{}{
		"event": event, "name": m.Name, "display_name": m.DisplayName, "status": inst.Status().String(),
	})
	room := websocket.WebsocketHub.GetRoom("instances")
	room.Send(string(data))
}

// timeSleep allows mocking in tests.
var timeSleep = time.Sleep
