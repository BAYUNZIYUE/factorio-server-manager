package api

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"
	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"

	"github.com/gorilla/mux"
)

type Route struct {
	Name        string
	Method      string
	Pattern     string
	HandlerFunc http.HandlerFunc
	ServerOff   bool // Set to `true' if factorio server has to be turned off to call this
}

type Routes []Route

func ServerOffMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// only run if server is turned off
		server := factorio.GetFactorioServer()
		if server.GetRunning() {
			http.Error(w, "factorio server still running", http.StatusLocked)
		} else {
			next.ServeHTTP(w, r)
		}
		return
	})
}

var spaHandler = func(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, must-revalidate")
	path := filepath.Join("app", r.URL.Path)
	if _, err := os.Stat(path); err == nil {
		http.ServeFile(w, r, path)
		return
	}
	http.ServeFile(w, r, filepath.Join("app", "index.html"))
}

func NewRouter() *mux.Router {
	mainRouter := mux.NewRouter().StrictSlash(true)

	// create subrouter for authenticated calls
	subRouter := mainRouter.NewRoute().Subrouter()
	subRouter.Use(AuthMiddleware)

	// API subrouter
	// Serves all JSON REST handlers prefixed with /api
	apiRouter := mainRouter.PathPrefix("/api").Subrouter()
	apiRouter.Use(AuthMiddleware)

	// use subrouter for calls, that run only, when server is turned off
	serverOffRouter := apiRouter.NewRoute().Subrouter()
	serverOffRouter.Use(ServerOffMiddleware)

	apiRouter.NewRoute().Subrouter()

	// Instance management routes
	apiRouter.Methods("GET").Path("/instances").Name("ListInstances").HandlerFunc(ListInstances)
	apiRouter.Methods("POST").Path("/instances").Name("CreateInstance").HandlerFunc(CreateInstance)
	apiRouter.Methods("DELETE").Path("/instances/{name}").Name("DeleteInstance").HandlerFunc(DeleteInstance)
	apiRouter.Methods("POST").Path("/instances/repair").Name("RepairInstance").HandlerFunc(RepairInstance)
	apiRouter.Methods("POST").Path("/instances/check-port").Name("CheckPortConflict").HandlerFunc(CheckPortConflict)
	apiRouter.Methods("GET").Path("/instances/{name}").Name("GetInstance").HandlerFunc(GetInstance)

	// Instance-scoped subrouter with InstanceMiddleware
	instanceRouter := apiRouter.PathPrefix("/instance/{name}").Subrouter()
	instanceRouter.Use(InstanceMiddleware)

	// Instance operations
	instanceRouter.Methods("POST").Path("/start").Name("StartInstance").HandlerFunc(StartInstance)
	instanceRouter.Methods("POST").Path("/stop").Name("StopInstance").HandlerFunc(StopInstance)
	instanceRouter.Methods("POST").Path("/kill").Name("KillInstance").HandlerFunc(KillInstance)
	instanceRouter.Methods("GET").Path("/status").Name("InstanceStatus").HandlerFunc(InstanceStatus)
	instanceRouter.Methods("GET").Path("/saves/list").Name("ListInstanceSaves").HandlerFunc(ListInstanceSaves)
	instanceRouter.Methods("GET").Path("/saves/dl/{save}").Name("DLInstanceSave").HandlerFunc(DLInstanceSave)
	instanceRouter.Methods("POST").Path("/saves/upload").Name("UploadInstanceSave").HandlerFunc(UploadInstanceSave)
	instanceRouter.Methods("GET").Path("/saves/rm/{save}").Name("RemoveInstanceSave").HandlerFunc(RemoveInstanceSave)
	instanceRouter.Methods("GET").Path("/saves/create/{save}").Name("CreateInstanceSave").HandlerFunc(CreateInstanceSave)
	instanceRouter.Methods("GET").Path("/settings").Name("GetInstanceSettings").HandlerFunc(GetInstanceSettings)
	instanceRouter.Methods("POST").Path("/settings/update").Name("UpdateInstanceSettings").HandlerFunc(UpdateInstanceSettings)
	instanceRouter.Methods("GET").Path("/log/tail").Name("InstanceLogTail").HandlerFunc(InstanceLogTail)
	instanceRouter.Methods("GET").Path("/config").Name("InstanceLoadConfig").HandlerFunc(InstanceLoadConfig)
	instanceRouter.Methods("GET").Path("/version/current").Name("InstanceVersionCurrent").HandlerFunc(GetCurrentVersion)
	instanceRouter.Methods("GET").Path("/version/available").Name("InstanceVersionAvailable").HandlerFunc(GetAvailableVersions)
	instanceRouter.Methods("GET").Path("/version/list").Name("InstanceVersionList").HandlerFunc(GetFullVersionList)
	instanceRouter.Methods("POST").Path("/version/install").Name("InstanceVersionInstall").HandlerFunc(InstallVersion)
	instanceRouter.Methods("GET").Path("/version/install-status").Name("InstanceVersionInstallStatus").HandlerFunc(GetInstallStatus)
	instanceRouter.Methods("GET").Path("/mods/list").Name("ListInstanceMods").HandlerFunc(ListInstalledModsHandler)
	instanceRouter.Methods("POST").Path("/mods/toggle").Name("ToggleInstanceMod").HandlerFunc(ModToggleHandler)
	instanceRouter.Methods("POST").Path("/mods/delete").Name("DeleteInstanceMod").HandlerFunc(ModDeleteHandler)
	instanceRouter.Methods("POST").Path("/mods/delete/all").Name("DeleteAllInstanceMods").HandlerFunc(ModDeleteAllHandler)
	instanceRouter.Methods("POST").Path("/mods/update").Name("UpdateInstanceMod").HandlerFunc(ModUpdateHandler)
	instanceRouter.Methods("POST").Path("/mods/upload").Name("UploadInstanceMod").HandlerFunc(ModUploadHandler)
	instanceRouter.Methods("GET").Path("/mods/download").Name("DownloadInstanceMods").HandlerFunc(ModDownloadHandler)

	// Legacy redirects for old /api/server/* paths
	apiRouter.Methods("POST").Path("/server/start").HandlerFunc(legacyRedirect("/api/instance/default/start"))
	apiRouter.Methods("GET").Path("/server/stop").HandlerFunc(legacyRedirect("/api/instance/default/stop"))
	apiRouter.Methods("GET").Path("/server/kill").HandlerFunc(legacyRedirect("/api/instance/default/kill"))
	apiRouter.Methods("GET").Path("/server/status").HandlerFunc(legacyRedirect("/api/instance/default/status"))
	apiRouter.Methods("GET").Path("/server/facVersion").HandlerFunc(legacyRedirect("/api/instances/default"))
	apiRouter.Methods("GET").Path("/server/availableVersions").HandlerFunc(legacyRedirect("/api/instance/default/version/available"))
	apiRouter.Methods("POST").Path("/server/install").HandlerFunc(legacyRedirect("/api/instance/default/version/install"))
	apiRouter.Methods("DELETE").Path("/server/install").HandlerFunc(legacyRedirect("/api/instance/default/version/install"))
	apiRouter.Methods("GET").Path("/server/version/current").HandlerFunc(legacyRedirect("/api/instance/default/version/current"))
	apiRouter.Methods("GET").Path("/server/version/available").HandlerFunc(legacyRedirect("/api/instance/default/version/available"))
	apiRouter.Methods("GET").Path("/server/version/list").HandlerFunc(legacyRedirect("/api/instance/default/version/list"))
	apiRouter.Methods("POST").Path("/server/version/install").HandlerFunc(legacyRedirect("/api/instance/default/version/install"))
	apiRouter.Methods("GET").Path("/server/version/install-status").HandlerFunc(legacyRedirect("/api/instance/default/version/install-status"))

	for _, route := range apiRoutes {
		var router *mux.Router
		if route.ServerOff {
			router = serverOffRouter
		} else {
			router = apiRouter
		}
		router.Methods(route.Method).
			Path(route.Pattern).
			Name(route.Name).
			Handler(route.HandlerFunc)
	}

	// The login handler does not check for authentication.
	mainRouter.Path("/api/login").
		Methods("POST").
		Name("LoginUser").
		HandlerFunc(LoginUser)

	// Route for initializing websocket connection
	// Clients connecting to /ws establish websocket connection by upgrading
	// HTTP session.
	// Ensure user is logged in with the AuthorizeHandler middleware
	subRouter.Path("/ws").
		Methods("GET").
		Name("Websocket").
		Handler(
			http.HandlerFunc(
				func(w http.ResponseWriter, r *http.Request) {
					websocket.ServeWs(w, r)
				},
			),
		)

	// Serves the frontend application from the app directory
	// Uses basic file server to serve index.html and Javascript application
	// Routes match the ones defined in React frontend application
	mainRouter.Path("/login").
		Methods("GET").
		Name("Login").
		Handler(http.StripPrefix("/login", http.FileServer(http.Dir("./app/"))))

	subRouter.Path("/saves").
		Methods("GET").
		Name("Saves").
		Handler(http.StripPrefix("/saves", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/mods").
		Methods("GET").
		Name("Mods").
		Handler(http.StripPrefix("/mods", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/server-settings").
		Methods("GET").
		Name("Server settings").
		Handler(http.StripPrefix("/server-settings", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/game-settings").
		Methods("GET").
		Name("Game settings").
		Handler(http.StripPrefix("/game-settings", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/console").
		Methods("GET").
		Name("Console").
		Handler(http.StripPrefix("/console", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/logs").
		Methods("GET").
		Name("Logs").
		Handler(http.StripPrefix("/logs", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/user-management").
		Methods("GET").
		Name("User management").
		Handler(http.StripPrefix("/user-management", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/help").
		Methods("GET").
		Name("Help").
		Handler(http.StripPrefix("/help", http.FileServer(http.Dir("./app/"))))
	subRouter.Path("/server-version").
		Methods("GET").
		Name("Server version").
		Handler(http.StripPrefix("/server-version", http.FileServer(http.Dir("./app/"))))

	// SPA: serve static files if they exist, otherwise serve index.html
	mainRouter.PathPrefix("/instances").Methods("GET").Name("Instances").HandlerFunc(spaHandler)
	mainRouter.PathPrefix("/instance").Methods("GET").Name("Instance").HandlerFunc(spaHandler)
	mainRouter.PathPrefix("/").Methods("GET").Name("Index").HandlerFunc(spaHandler)

	return mainRouter
}

// Defines all API REST endpoints
// All routes are prefixed with /api
var apiRoutes = Routes{
	{
		"ListSaves",
		"GET",
		"/saves/list",
		ListSaves,
		false,
	}, {
		"DlSave",
		"GET",
		"/saves/dl/{save}",
		DLSave,
		false,
	}, {
		"UploadSave",
		"POST",
		"/saves/upload",
		UploadSave,
		false,
	}, {
		"RemoveSave",
		"GET",
		"/saves/rm/{save}",
		RemoveSave,
		false,
	}, {
		"CreateSave",
		"GET",
		"/saves/create/{save}",
		CreateSaveHandler,
		true,
	}, {
		"LoadModsFromSave",
		"POST",
		"/saves/mods",
		LoadModsFromSaveHandler,
		true,
	}, {
		"GetModsFromSave",
		"POST",
		"/saves/mods/list",
		GetModsFromSaveHandler,
		true,
	}, 	{
		"SyncModsFromSave",
		"POST",
		"/saves/mods/sync",
		SyncModsFromSaveHandler,
		true,
	}, {
		"CancelModsSync",
		"POST",
		"/saves/mods/sync/cancel",
		CancelModsSyncHandler,
		false,
	}, {
		"LogTail",
		"GET",
		"/log/tail",
		LogTail,
		false,
	}, {
		"LoadConfig",
		"GET",
		"/config",
		LoadConfig,
		false,
	}, {
		"StartServer",
		"POST",
		"/server/start",
		StartServer,
		true,
	}, {
		"StopServer",
		"GET",
		"/server/stop",
		StopServer,
		false,
	}, {
		"KillServer",
		"GET",
		"/server/kill",
		KillServer,
		false,
	}, {
		"RunningServer",
		"GET",
		"/server/status",
		CheckServer,
		false,
	}, {
		"FactorioVersion",
		"GET",
		"/server/facVersion",
		FactorioVersion,
		false,
	}, {
		"AvailableVersions",
		"GET",
		"/server/availableVersions",
		AvailableVersions,
		false,
	}, {
		"InstallFactorio",
		"POST",
		"/server/install",
		InstallFactorio,
		true,
	}, {
		"RemoveFactorio",
		"DELETE",
		"/server/install",
		RemoveFactorio,
		true,
	}, {
		"LogoutUser",
		"GET",
		"/logout",
		LogoutUser,
		false,
	}, {
		"StatusUser",
		"GET",
		"/user/status",
		GetCurrentLogin,
		false,
	}, {
		"ListUsers",
		"GET",
		"/user/list",
		ListUsers,
		false,
	}, {
		"AddUser",
		"POST",
		"/user/add",
		AddUser,
		false,
	}, {
		"RemoveUser",
		"POST",
		"/user/remove",
		RemoveUser,
		false,
	}, {
		"ChangePassword",
		"POST",
		"/user/password",
		ChangePassword,
		false,
	}, {
		"GetServerSettings",
		"GET",
		"/settings",
		GetServerSettings,
		false,
	}, {
		"UpdateServerSettings",
		"POST",
		"/settings/update",
		UpdateServerSettings,
		false,
	}, {
		"GetCurrentVersion",
		"GET",
		"/server/version/current",
		GetCurrentVersion,
		false,
	}, {
		"GetAvailableVersions",
		"GET",
		"/server/version/available",
		GetAvailableVersions,
		false,
	}, {
		"GetFullVersionList",
		"GET",
		"/server/version/list",
		GetFullVersionList,
		false,
	}, {
		"InstallVersion",
		"POST",
		"/server/version/install",
		InstallVersion,
		true,
	}, {
		"GetInstallStatus",
		"GET",
		"/server/version/install-status",
		GetInstallStatus,
		false,
	},
	// Mod Portal Stuff
	{
		"ModPortalListAllMods",
		"GET",
		"/mods/portal/list",
		ModPortalListModsHandler,
		false,
	}, {
		"ModPortalGetModInfo",
		"GET",
		"/mods/portal/info/{mod}",
		ModPortalModInfoHandler,
		false,
	}, {
		"ModPortalInstallMod",
		"POST",
		"/mods/portal/install",
		ModPortalInstallHandler,
		true,
	}, {
		"ModPortalLogin",
		"POST",
		"/mods/portal/login",
		ModPortalLoginHandler,
		false,
	}, {
		"ModPortalLoginStatus",
		"GET",
		"/mods/portal/loginstatus",
		ModPortalLoginStatusHandler,
		false,
	}, {
		"ModPortalLogout",
		"GET",
		"/mods/portal/logout",
		ModPortalLogoutHandler,
		false,
	}, {
		"ModPortalInstallMultiple",
		"POST",
		"/mods/portal/install/multiple",
		ModPortalInstallMultipleHandler,
		true,
	},
	// Mods Stuff
	{
		"ListInstalledMods",
		"GET",
		"/mods/list",
		ListInstalledModsHandler,
		false,
	}, {
		"ToggleMod",
		"POST",
		"/mods/toggle",
		ModToggleHandler,
		true,
	}, {
		"DeleteMod",
		"POST",
		"/mods/delete",
		ModDeleteHandler,
		true,
	}, {
		"DeleteAllMods",
		"POST",
		"/mods/delete/all",
		ModDeleteAllHandler,
		true,
	}, {
		"UpdateMod",
		"POST",
		"/mods/update",
		ModUpdateHandler,
		true,
	}, {
		"UploadMod",
		"POST",
		"/mods/upload",
		ModUploadHandler,
		true,
	}, {
		"DownloadMods",
		"GET",
		"/mods/download",
		ModDownloadHandler,
		false,
	},
	// Mod Packs
	{
		"ModPacksList",
		"GET",
		"/mods/packs/list",
		ModPackListHandler,
		false,
	}, {
		"ModPackCreate",
		"POST",
		"/mods/packs/create",
		ModPackCreateHandler,
		false,
	}, {
		"ModPackDelete",
		"POST",
		"/mods/packs/{modpack}/delete",
		ModPackDeleteHandler,
		false,
	}, {
		"ModPackDownload",
		"GET",
		"/mods/packs/{modpack}/download",
		ModPackDownloadHandler,
		false,
	}, {
		"LoadModPack",
		"POST",
		"/mods/packs/{modpack}/load",
		ModPackLoadHandler,
		true,
	},
	// Mods inside Mod Packs
	{
		"ModPackListMods",
		"GET",
		"/mods/packs/{modpack}/list",
		ModPackModListHandler,
		false,
	}, {
		"ModPackToggleMod",
		"POST",
		"/mods/packs/{modpack}/mod/toggle",
		ModPackModToggleHandler,
		false,
	}, {
		"ModPackDeleteMod",
		"POST",
		"/mods/packs/{modpack}/mod/delete",
		ModPackModDeleteHandler,
		false,
	}, {
		"ModPackDeleteAllMod",
		"POST",
		"/mods/packs/{modpack}/mod/delete/all",
		ModPackModDeleteAllHandler,
		false,
	}, {
		"ModPackUpdateMod",
		"POST",
		"/mods/packs/{modpack}/mod/update",
		ModPackModUpdateHandler,
		false,
	}, {
		"ModPackUploadMod",
		"POST",
		"/mods/packs/{modpack}/mod/upload",
		ModPackModUploadHandler,
		false,
	}, {
		"ModPackModPortalInstallMod",
		"POST",
		"/mods/packs/{modpack}/portal/install",
		ModPackModPortalInstallHandler,
		false,
	}, {
		"ModPackModPortalInstallMultiple",
		"POST",
		"/mods/packs/{modpack}/portal/install/multiple",
		ModPackModPortalInstallMultipleHandler,
		false,
	},
}

// legacyRedirect returns a handler that issues 308 redirect for backward compat.
func legacyRedirect(targetPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resolvedPath := targetPath
		for k, v := range mux.Vars(r) {
			resolvedPath = strings.ReplaceAll(resolvedPath, "{"+k+"}", v)
		}
		log.Printf("Legacy endpoint %s -> 308 to %s", r.URL.Path, resolvedPath)
		http.Redirect(w, r, resolvedPath, http.StatusPermanentRedirect)
	}
}
