package main

import (
	"log"
	"net/http"
	"os"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api"
	"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"
	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
	"github.com/OpenFactorioServerManager/factorio-server-manager/instance"
	"github.com/OpenFactorioServerManager/factorio-server-manager/jobqueue"
)

func main() {
	config := bootstrap.NewConfig(os.Args[1:])

	manager := instance.NewManager(config.InstancesDir)

	// Migration: old single-instance layout -> instances/default/
	if needsMigration(config) {
		if err := instance.MigrateToMultiInstance(config); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		// Re-discover after migration
		manager = instance.NewManager(config.InstancesDir)
	}

	if err := manager.Discover(); err != nil {
		log.Fatalf("Error discovering instances: %v", err)
	}

	factorio.GlobalInstanceManager = manager
	api.SetInstanceManager(manager)

	// Job queue with WebSocket broadcasting
	queue := jobqueue.NewQueue(&wshubAdapter{}, 20)
	jobqueue.SetGlobalQueue(queue)

	factorio.ModStartUp()

	// Auto-start instances with autostart=true
	for _, inst := range manager.List() {
		if inst.Metadata().Autostart {
			inst := inst
			go func() {
				log.Printf("Auto-starting instance: %s", inst.Metadata().Name)
				if err := inst.Start(); err != nil {
					log.Printf("Error auto-starting instance %s: %v", inst.Metadata().Name, err)
				}
			}()
		}
	}

	api.SetupAuth()
	router := api.NewRouter()

	log.Printf("Starting server on: %s:%s", config.ServerIP, config.ServerPort)
	log.Fatal(http.ListenAndServe(config.ServerIP+":"+config.ServerPort, router))
}

func needsMigration(config bootstrap.Config) bool {
	if _, err := os.Stat(config.InstancesDir); !os.IsNotExist(err) {
		return false // instances/ exists
	}
	if _, err := os.Stat("saves"); os.IsNotExist(err) {
		return false
	}
	if _, err := os.Stat("mods"); os.IsNotExist(err) {
		return false
	}
	return true
}

type wshubAdapter struct{}

func (a *wshubAdapter) Send(room string, msg interface{}) {
	websocket.WebsocketHub.Broadcast(msg)
}
