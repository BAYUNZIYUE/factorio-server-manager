package factorio

import (
	"archive/tar"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
	"github.com/ulikunitz/xz"
)

type Release struct {
	Version string `json:"version"`
	Stable  bool   `json:"stable"`
	Latest  bool   `json:"latest,omitempty"`
}

type VersionData map[string]string

type DownloadsResponse struct {
	Stable       VersionData `json:"stable"`
	Experimental VersionData `json:"experimental"`
}

type VersionManager struct {
	FactorioDir    string
	FactorioBinary string
	Credentials    *Credentials
}

func (vm *VersionManager) GetCurrentVersion() (string, error) {
	cmd := exec.Command(vm.FactorioBinary, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get current version: %w", err)
	}
	line := string(output)
	return parseVersionLine(line)
}

func (vm *VersionManager) GetAvailableVersions() ([]Release, error) {
	resp, err := http.Get("https://factorio.com/api/latest-releases")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch releases: %w", err)
	}
	defer resp.Body.Close()

	var data DownloadsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to parse releases: %w", err)
	}

	releases := []Release{}
	if v, ok := data.Stable["headless"]; ok && v != "" {
		releases = append(releases, Release{Version: v, Stable: true, Latest: true})
	}
	if v, ok := data.Experimental["headless"]; ok && v != "" {
		releases = append(releases, Release{Version: v, Stable: false, Latest: false})
	}

	return releases, nil
}

func (vm *VersionManager) DownloadAndInstall(version string, progressCb func(percent int)) error {
	if vm.Credentials == nil || vm.Credentials.Userkey == "" {
		return fmt.Errorf("Factorio.com credentials required. Log in via Mod Portal first.")
	}

	downloadURL := fmt.Sprintf("https://factorio.com/get-download/%s/headless/linux64", version)

	tmpFile, err := os.CreateTemp("", "factorio-download-*.tar.xz")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.SetBasicAuth(vm.Credentials.Username, vm.Credentials.Userkey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %d (check your Factorio.com credentials)", resp.StatusCode)
	}

	contentLength := resp.ContentLength
	pr := &ProgressReader{
		Reader:     resp.Body,
		Total:      contentLength,
		OnProgress: progressCb,
	}

	_, err = io.Copy(tmpFile, pr)
	if err != nil {
		return fmt.Errorf("failed to save download: %w", err)
	}
	tmpFile.Close()

	binDir := filepath.Dir(vm.FactorioBinary)
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}

	err = extractTarXz(tmpFile.Name(), vm.FactorioDir)
	if err != nil {
		return fmt.Errorf("failed to extract: %w", err)
	}

	err = os.Chmod(vm.FactorioBinary, 0755)
	if err != nil {
		return fmt.Errorf("failed to make binary executable: %w", err)
	}

	return nil
}

type ProgressReader struct {
	Reader     io.Reader
	Total      int64
	Current    int64
	OnProgress func(percent int)
}

func (pr *ProgressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	pr.Current += int64(n)
	if pr.Total > 0 && pr.OnProgress != nil {
		pct := int(float64(pr.Current) / float64(pr.Total) * 100)
		pr.OnProgress(pct)
	}
	return n, err
}

func NewVersionManager() *VersionManager {
	config := bootstrap.GetConfig()
	var creds Credentials
	creds.Load()
	return &VersionManager{
		FactorioDir:    config.FactorioDir,
		FactorioBinary: config.FactorioBinary,
		Credentials:    &creds,
	}
}

func parseVersionLine(line string) (string, error) {
	if idx := strings.Index(line, "Version:"); idx >= 0 {
		rest := line[idx+len("Version:"):]
		rest = strings.TrimSpace(rest)
		if spaceIdx := strings.Index(rest, " "); spaceIdx > 0 {
			return rest[:spaceIdx], nil
		}
		return rest, nil
	}
	lines := strings.Split(strings.TrimSpace(line), "\n")
	if len(lines) > 0 {
		return strings.TrimSpace(lines[0]), nil
	}
	return "", fmt.Errorf("could not parse version from: %s", line)
}

func extractTarXz(filePath string, destDir string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	xzReader, err := xz.NewReader(f)
	if err != nil {
		return err
	}

	tarReader := tar.NewReader(xzReader)

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		targetPath := header.Name
		if strings.HasPrefix(targetPath, "factorio/") {
			targetPath = targetPath[len("factorio/"):]
		}
		targetPath = filepath.Join(destDir, targetPath)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return err
			}
			outFile, err := os.Create(targetPath)
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tarReader); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()
			if err := os.Chmod(targetPath, os.FileMode(header.Mode)); err != nil {
				return err
			}
		}
	}

	return nil
}
