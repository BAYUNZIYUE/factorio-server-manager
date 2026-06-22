package api

import (
	"fmt"
	"log"
	"net/http"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"
	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
	"github.com/gorilla/mux"
)

func ModPortalListModsHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	var statusCode int
	resp, err, statusCode = factorio.ModPortalList()
	w.WriteHeader(statusCode)
	if err != nil {
		resp = fmt.Sprintf("Error in listing mods from mod portal: %s\nresponse: %+v", err, resp)
		log.Println(resp)
		return
	}
}

// ModPortalModInfoHandler returns JSON response with the mod details
func ModPortalModInfoHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	vars := mux.Vars(r)
	modId := vars["mod"]

	var statusCode int
	resp, err, statusCode = factorio.ModPortalModDetails(modId)

	if err != nil {
		resp = fmt.Sprintf("Error in getting mod details from mod portal: %s", err)
		log.Println(resp)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(statusCode)
}

func ModPortalInstallHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	// Get Data out of the request
	var data struct {
		DownloadURL string `json:"downloadUrl"`
		Filename    string `json:"fileName"`
		ModName     string `json:"modName"`
	}
	resp, err = ReadFromRequestBody(w, r, &data)
	if err != nil {
		return
	}

	mods, resp, err := CreateNewMods(w)
	if err != nil {
		return
	}

	_, err = mods.DownloadMod(data.DownloadURL, data.Filename, data.ModName, nil)
	if err != nil {
		resp = fmt.Sprintf("Error downloading a mod: %s", err)
		log.Println(resp)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	resp = mods.ListInstalledMods()
}

func ModPortalLoginHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	var data struct {
		Username string `json:"username"`
		Token    string `json:"token"`
	}
	resp, err = ReadFromRequestBody(w, r, &data)
	if err != nil {
		return
	}

	err, statusCode := factorio.FactorioLoginWithToken(data.Username, data.Token)
	w.WriteHeader(statusCode)
	if err != nil {
		resp = fmt.Sprintf("Error trying to login into Factorio: %s", err)
		log.Println(resp)
		return
	}
}

func ModPortalLoginStatusHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	var credentials factorio.Credentials
	resp, err = credentials.Load()

	if err != nil {
		resp = fmt.Sprintf("Error getting the factorio credentials: %s", err)
		log.Println(resp)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
}

func ModPortalLogoutHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	var credentials factorio.Credentials
	err = credentials.Del()

	if err != nil {
		resp = fmt.Sprintf("Error on logging out of factorio: %s", err)
		log.Println(resp)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	resp = false
}

func ModPortalInstallMultipleHandler(w http.ResponseWriter, r *http.Request) {
	var err error
	var resp interface{}

	defer func() {
		WriteResponse(w, resp)
	}()

	w.Header().Set("Content-Type", "application/json;charset=UTF-8")

	var data []struct {
		Name    string           `json:"name"`
		Version factorio.Version `json:"version"`
	}
	resp, err = ReadFromRequestBody(w, r, &data)
	if err != nil {
		return
	}

	modList, resp, err := CreateNewMods(w)
	if err != nil {
		return
	}

	wsRoom := websocket.WebsocketHub.GetRoom("mod_install")
	total := len(data)

	type job struct {
		index int
		name  string
		ver   factorio.Version
	}
	type result struct {
		index int
		name  string
		size  int64
		err   error
	}

	jobs := make(chan job, total)
	results := make(chan result, total)

	workers := 5
	if total < workers {
		workers = total
	}

	for w := 0; w < workers; w++ {
		go func(wid int) {
			for j := range jobs {
				var r result
				r.index = j.index
				r.name = j.name
				wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"start\"}", wid, j.name))
				details, err, statusCode := factorio.ModPortalModDetails(j.name)
				if err != nil || statusCode != http.StatusOK {
					r.err = fmt.Errorf("portal lookup failed")
					wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"error\"}", wid, j.name))
					results <- r
					continue
				}
				found := false
				for _, release := range details.Releases {
					if release.Version.Equals(j.ver) {
						found = true
						size := getContentLength(release.DownloadURL)
						wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"downloading\",\"size\":%d}", wid, j.name, size))
						_, dl := modList.DownloadMod(release.DownloadURL, release.FileName, details.Name, func(read, total int64) {
							pct := 0
							if total > 0 { pct = int(read * 100 / total) }
							wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"downloading\",\"size\":%d,\"pct\":%d}", wid, j.name, size, pct))
						})
						if dl != nil {
							r.err = dl
							wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"error\"}", wid, j.name))
						} else {
							wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"done\",\"size\":%d}", wid, j.name, size))
						}
						break
					}
				}
				if !found {
					r.err = fmt.Errorf("version not found")
					wsRoom.Send(fmt.Sprintf("{\"type\":\"worker\",\"worker\":%d,\"name\":\"%s\",\"state\":\"error\"}", wid, j.name))
				}
				results <- r
			}
		}(w)
	}

	for i, datum := range data {
		if datum.Name != "base" {
			jobs <- job{index: i, name: datum.Name, ver: datum.Version}
		} else {
			results <- result{index: i, name: "base"}
		}
	}
	close(jobs)

	completed := 0
	wsRoom.Send(fmt.Sprintf("{\"type\":\"start\",\"total\":%d}", total))
	for completed < total {
		r := <-results
		completed++
		if r.err != nil {
			log.Printf("Error downloading mod {%s}: %v", r.name, r.err)
		}
		wsRoom.Send(fmt.Sprintf("{\"type\":\"progress\",\"current\":%d,\"total\":%d,\"name\":\"%s\",\"active\":%d}", completed, total, r.name, workers))
	}

	wsRoom.Send(fmt.Sprintf("{\"type\":\"complete\",\"total\":%d}", total))

	resp = modList.ListInstalledMods()
}

func getContentLength(downloadURL string) int64 {
	var creds factorio.Credentials
	if ok, _ := creds.Load(); !ok {
		return 0
	}
	u := "https://mods.factorio.com" + downloadURL + "?username=" + creds.Username + "&token=" + creds.Userkey
	resp, err := http.Head(u)
	if err != nil {
		return 0
	}
	resp.Body.Close()
	return resp.ContentLength
}
