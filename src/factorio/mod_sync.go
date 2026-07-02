package factorio

import (
	"bytes"
	"compress/flate"
	"compress/zlib"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/OpenFactorioServerManager/factorio-server-manager/api/websocket"
	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
)

var modsSyncing atomic.Bool
var modsSyncCancel atomic.Bool

func IsModsSyncing() bool {
	return modsSyncing.Load()
}

func CancelModsSync() {
	modsSyncCancel.Store(true)
}

type ModSyncResult struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Status  string `json:"status"` // downloaded, already_installed, builtin, not_found
}

type ModSyncProgress struct {
	Type       string          `json:"type"`
	Status     string          `json:"status"`
	Current    int             `json:"current,omitempty"`
	Total      int             `json:"total,omitempty"`
	Mod        string          `json:"mod,omitempty"`
	Message    string          `json:"message,omitempty"`
	Warning    string          `json:"warning,omitempty"`
	Mods       []ModSyncResult `json:"mods,omitempty"`
	Downloaded int64           `json:"downloaded,omitempty"`
	Size       int64           `json:"size,omitempty"`
}

// baseModNames — моды которые есть в любом vanilla + DLC сейве
var baseModNames = map[string]bool{
	"base":           true,
	"elevated-rails": true,
	"quality":        true,
	"space-age":      true,
}

// isVanillaSave — true если сейв создан без геймплейных модов
func isVanillaSave(mods []Mod) bool {
	for _, m := range mods {
		if !baseModNames[m.Name] {
			return false
		}
	}
	return true
}

func sendSyncProgress(p ModSyncProgress) {
	p.Type = "mods_sync"
	data, _ := json.Marshal(p)
	room := websocket.WebsocketHub.GetRoom("mods_sync")
	room.Send(string(data))
}

type portalModRelease struct {
	DownloadURL string `json:"download_url"`
	FileName    string `json:"file_name"`
	Version     string `json:"version"`
}

type portalModInfo struct {
	Releases []portalModRelease `json:"releases"`
}

// normalizeVersion убирает четвёртый компонент если он 0
// version48 читает только 3 части, v[3] всегда 0
// info.json хранит версию как "1.2.3", поэтому приводим к одному формату
func normalizeVersion(v Version) string {
	if v[3] == 0 {
		return fmt.Sprintf("%d.%d.%d", v[0], v[1], v[2])
	}
	return v.String()
}

var ErrModNotOnPortal = fmt.Errorf("mod not available on portal (builtin or DLC)")
var ErrVersionNotFound = fmt.Errorf("requested version not found on portal")

// LevelDatMod хранит мод из level.dat0
type LevelDatMod struct {
	Name    string
	Version Version
}

// readModsFromLevelDat читает полный список модов с версиями из level.dat0
// Это работает для всех модов включая добавленные после создания сейва
func readModsFromLevelDat(savePath string) ([]LevelDatMod, error) {
	f, err := OpenArchiveFile(savePath, "level.dat0")
	if err != nil {
		return nil, fmt.Errorf("cannot open level.dat0: %v", err)
	}
	defer f.Close()

	compressed, err := ioutil.ReadAll(f)
	if err != nil {
		return nil, fmt.Errorf("cannot read level.dat0: %v", err)
	}

	// Распаковываем zlib
	data, err := zlibDecompress(compressed)
	if err != nil {
		return nil, fmt.Errorf("cannot decompress level.dat0: %v", err)
	}

	// Таблица модов начинается на смещении 0x2c
	if len(data) < 0x2d {
		return nil, fmt.Errorf("level.dat0 too small")
	}

	pos := 0x2c
	n := int(data[pos]); pos++

	var mods []LevelDatMod
	for i := 0; i < n; i++ {
		if pos >= len(data) {
			break
		}
		nameLen := int(data[pos]); pos++
		if pos+nameLen+7 > len(data) {
			break
		}
		name := string(data[pos : pos+nameLen]); pos += nameLen
		v0, v1, v2 := uint(data[pos]), uint(data[pos+1]), uint(data[pos+2]); pos += 3
		pos += 4 // CRC
		mods = append(mods, LevelDatMod{
			Name:    name,
			Version: Version{v0, v1, v2, 0},
		})
	}

	return mods, nil
}

// zlibDecompress распаковывает zlib данные
func zlibDecompress(data []byte) ([]byte, error) {
	// Пробуем стандартный zlib
	r, err := zlib.NewReader(bytes.NewReader(data))
	if err == nil {
		defer r.Close()
		return ioutil.ReadAll(r)
	}
	// Пробуем raw deflate
	r2 := flate.NewReader(bytes.NewReader(data))
	defer r2.Close()
	return ioutil.ReadAll(r2)
}

func getModRelease(modName string, version string) (portalModRelease, error) {
	url := fmt.Sprintf("https://mods.factorio.com/api/mods/%s", modName)
	resp, err := http.Get(url)
	if err != nil {
		return portalModRelease{}, fmt.Errorf("portal request failed: %v", err)
	}
	defer resp.Body.Close()

	// 404 — мод не на портале (DLC или встроенный)
	if resp.StatusCode == 404 {
		return portalModRelease{}, ErrModNotOnPortal
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return portalModRelease{}, fmt.Errorf("reading portal response: %v", err)
	}

	// category: internal — встроенный DLC мод, не качаем
	var fullInfo struct {
		Category string             `json:"category"`
		Releases []portalModRelease `json:"releases"`
	}
	if err := json.Unmarshal(body, &fullInfo); err == nil {
		if fullInfo.Category == "no-category" && len(fullInfo.Releases) == 0 {
			return portalModRelease{}, ErrModNotOnPortal
		}
		if fullInfo.Category == "internal" && len(fullInfo.Releases) == 0 {
			return portalModRelease{}, ErrModNotOnPortal
		}
	}

	var info portalModInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return portalModRelease{}, fmt.Errorf("parsing portal response: %v", err)
	}

	for _, release := range info.Releases {
		if release.Version == version {
			return release, nil
		}
	}

	if len(info.Releases) > 0 {
		return info.Releases[0], ErrVersionNotFound
	}

	return portalModRelease{}, fmt.Errorf("version %s not found for mod %s on portal", version, modName)
}

// SyncModsFromSave читает моды из сейва, сравнивает с установленными,
// качает только недостающие. Прогресс через WebSocket room "mods_sync".
// Пока идёт синк — IsModsSyncing() возвращает true, сервер не стартует.
func SyncModsFromSave(savePath string, modNames []string) {
	if !modsSyncing.CompareAndSwap(false, true) {
		log.Println("SyncModsFromSave: already syncing, skipping")
		sendSyncProgress(ModSyncProgress{Status: "error", Message: "sync already in progress"})
		return
	}
	defer modsSyncing.Store(false)
	modsSyncCancel.Store(false)

	config := bootstrap.GetConfig()

	// 1. Читаем список модов из сейва
	f, err := OpenArchiveFile(savePath, "level.dat", "level-init.dat")
	if err != nil {
		sendSyncProgress(ModSyncProgress{Status: "error", Message: fmt.Sprintf("cannot open save: %v", err)})
		return
	}
	defer f.Close()

	var header SaveHeader
	if err := header.ReadFrom(f); err != nil {
		sendSyncProgress(ModSyncProgress{Status: "error", Message: fmt.Sprintf("cannot read save header: %v", err)})
		return
	}

	// 1.5. Читаем полный список модов из level.dat0
	levelMods, err := readModsFromLevelDat(savePath)
	if err != nil {
		log.Printf("SyncModsFromSave: cannot read level.dat0, falling back to header: %v", err)
	} else {
		header.Mods = nil
		for _, lm := range levelMods {
			header.Mods = append(header.Mods, Mod{Name: lm.Name, Version: lm.Version})
		}
		log.Printf("SyncModsFromSave: loaded %d mods from level.dat0", len(header.Mods))
	}

		// 1.6. Проверяем тип сейва
	var vanillaWarning string
	if isVanillaSave(header.Mods) {
		vanillaWarning = "Сейв создан без геймплейных модов. Моды могли быть добавлены позже — синхронизация может быть неполной."
		log.Println("SyncModsFromSave: vanilla save detected, mods may have been added later")
	}

	// 2. Читаем установленные моды
	mods, err := NewMods(config.FactorioModsDir)
	if err != nil {
		sendSyncProgress(ModSyncProgress{Status: "error", Message: fmt.Sprintf("cannot read installed mods: %v", err)})
		return
	}

	// 3. Map установленных: name -> version (из info.json, формат "1.2.3")
	installed := make(map[string]string)
	for _, m := range mods.ModInfoList.Mods {
		installed[m.Name] = m.Version
	}

	// Строим set модов для скачивания если передан список
	filterMods := make(map[string]bool)
	for _, name := range modNames {
		filterMods[name] = true
	}

	// 4. Обходим все моды из сейва — собираем результаты
	var results []ModSyncResult
	var toDownload []Mod

	for _, saveMod := range header.Mods {
		if saveMod.Name == "base" {
			continue
		}
		// Если передан список — качаем только выбранные
		if len(filterMods) > 0 && !filterMods[saveMod.Name] {
			continue
		}
		wantVersion := normalizeVersion(saveMod.Version)
		if gotVersion, ok := installed[saveMod.Name]; ok && gotVersion == wantVersion {
			log.Printf("SyncModsFromSave: %s %s already installed, skipping", saveMod.Name, wantVersion)
			results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "already_installed"})
			continue
		}
		toDownload = append(toDownload, saveMod)
	}

	total := len(toDownload)
	log.Printf("SyncModsFromSave: %d mods to download", total)

	if total == 0 {
		sendSyncProgress(ModSyncProgress{Status: "done", Total: 0, Mods: results, Warning: vanillaWarning})
		return
	}

	sem := make(chan struct{}, 5)
	var wg sync.WaitGroup
	var resultsMu sync.Mutex

	for _, saveMod := range toDownload {
		saveMod := saveMod
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("PANIC in sync goroutine for %s: %v", saveMod.Name, r)
				}
			}()

			wantVersion := normalizeVersion(saveMod.Version)

			if baseModNames[saveMod.Name] {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "builtin"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "builtin", Mod: saveMod.Name})
				return
			}

			sem <- struct{}{}
			defer func() { <-sem }()

			if modsSyncCancel.Load() {
				return
			}

			release, err := getModRelease(saveMod.Name, wantVersion)
			if err == ErrModNotOnPortal {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "builtin"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "builtin", Mod: saveMod.Name})
				return
			}
			if errors.Is(err, ErrVersionNotFound) {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "version_mismatch"})
				resultsMu.Unlock()
				info, _ := json.Marshal(map[string]string{
					"downloadUrl": release.DownloadURL,
					"fileName":    release.FileName,
					"latest":      release.Version,
				})
				sendSyncProgress(ModSyncProgress{Status: "version_mismatch", Mod: saveMod.Name, Message: string(info)})
				return
			}
			if err != nil {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "not_found"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "not_found", Mod: saveMod.Name})
				return
			}

			sendSyncProgress(ModSyncProgress{Status: "progress", Total: total, Mod: saveMod.Name})

			cfg := bootstrap.GetConfig()
			creds := Credentials{}
			if _, statusErr := creds.Load(); statusErr != nil {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "not_found"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "not_found", Mod: saveMod.Name})
				return
			}

			dlURL := "https://mods.factorio.com" + release.DownloadURL + "?username=" + creds.Username + "&token=" + creds.Userkey
			dlResp, dlErr := http.Get(dlURL)
			if dlErr != nil {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "not_found"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "not_found", Mod: saveMod.Name})
				return
			}
			defer dlResp.Body.Close()

			if dlResp.StatusCode != 200 {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "not_found"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "not_found", Mod: saveMod.Name})
				return
			}

			filePath := filepath.Join(cfg.FactorioModsDir, release.FileName)
			FileLock.LockW(filePath)
			defer FileLock.Unlock(filePath)
			outFile, createErr := os.Create(filePath)
			if createErr != nil {
				resultsMu.Lock()
				results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "not_found"})
				resultsMu.Unlock()
				sendSyncProgress(ModSyncProgress{Status: "not_found", Mod: saveMod.Name})
				return
			}

			totalSize := dlResp.ContentLength
			var written int64
			if totalSize > 0 {
				buf := make([]byte, 32*1024)
				for {
					if modsSyncCancel.Load() {
						break
					}
					n, readErr := dlResp.Body.Read(buf)
					if n > 0 {
						_, writeErr := outFile.Write(buf[:n])
						if writeErr != nil {
							break
						}
						written += int64(n)
						sendSyncProgress(ModSyncProgress{
							Status:     "progress",
							Total:      total,
							Mod:        saveMod.Name,
							Downloaded: written,
							Size:       totalSize,
						})
					}
					if readErr != nil {
						break
					}
				}
			} else {
				written, _ = io.Copy(outFile, dlResp.Body)
			}
			outFile.Close()

			resultsMu.Lock()
			results = append(results, ModSyncResult{Name: saveMod.Name, Version: wantVersion, Status: "downloaded"})
			resultsMu.Unlock()
			log.Printf("SyncModsFromSave: downloaded %s %s", saveMod.Name, wantVersion)

			sendSyncProgress(ModSyncProgress{
				Status: "downloaded",
				Mod:    saveMod.Name,
			})
		}()
	}

	wg.Wait()

	sendSyncProgress(ModSyncProgress{Status: "done", Total: total, Mods: results, Warning: vanillaWarning})
}

// ModStatus — статус мода при сравнении сейва с установленными
type ModStatus struct {
	Name            string `json:"name"`
	VersionRequired string `json:"version_required"` // версия в сейве
	VersionInstalled string `json:"version_installed"` // версия установленная (если есть)
	Status          string `json:"status"` // missing, installed, wrong_version, builtin
	PortalURL       string `json:"portal_url"`
}

// GetModsFromSave читает моды из сейва и сравнивает с установленными
func GetModsFromSave(savePath string) ([]ModStatus, error) {
	config := bootstrap.GetConfig()

	// Читаем моды из level.dat0
	levelMods, err := readModsFromLevelDat(savePath)
	if err != nil {
		return nil, fmt.Errorf("cannot read mods from save: %v", err)
	}

	// Читаем установленные моды
	mods, err := NewMods(config.FactorioModsDir)
	if err != nil {
		return nil, fmt.Errorf("cannot read installed mods: %v", err)
	}

	installed := make(map[string]string)
	for _, m := range mods.ModInfoList.Mods {
		installed[m.Name] = m.Version
	}

	var result []ModStatus
	for _, lm := range levelMods {
		if lm.Name == "base" {
			continue
		}

		wantVersion := normalizeVersion(lm.Version)
		status := ModStatus{
			Name:            lm.Name,
			VersionRequired: wantVersion,
			PortalURL:       "https://mods.factorio.com/mod/" + lm.Name,
		}

		if baseModNames[lm.Name] {
			status.Status = "builtin"
		} else if gotVersion, ok := installed[lm.Name]; ok {
			status.VersionInstalled = gotVersion
			if gotVersion == wantVersion {
				status.Status = "installed"
			} else {
				status.Status = "wrong_version"
			}
		} else {
			status.Status = "missing"
		}

		result = append(result, status)
	}

	return result, nil
}
