package instance

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
)

// MigrateToMultiInstance performs one-time migration from old single-instance layout.
func MigrateToMultiInstance(config bootstrap.Config) error {
	log.Println("Starting migration to multi-instance layout...")

	sentinelFile := filepath.Join(config.InstancesDir, ".migrated")
	if _, err := os.Stat(sentinelFile); err == nil {
		log.Println("Migration already completed, skipping")
		return nil
	}

	defaultDir := filepath.Join(config.InstancesDir, "default")
	if _, err := os.Stat(defaultDir); err == nil {
		log.Printf("Default instance dir %s exists, skipping", defaultDir)
		return nil
	}

	if err := os.MkdirAll(defaultDir, 0755); err != nil {
		return fmt.Errorf("failed to create %s: %w", defaultDir, err)
	}
	for _, sub := range []string{"saves", "mods", "config", "bin", "bin/x64", "data"} {
		if err := os.MkdirAll(filepath.Join(defaultDir, sub), 0755); err != nil {
			return fmt.Errorf("failed to create %s: %w", sub, err)
		}
	}

	migrations := []struct{ src, dst string }{
		{"saves", filepath.Join(defaultDir, "saves")},
		{"mods", filepath.Join(defaultDir, "mods")},
		{"config", filepath.Join(defaultDir, "config")},
	}
	if _, err := os.Stat("bin"); err == nil {
		migrations = append(migrations, struct{ src, dst string }{"bin", filepath.Join(defaultDir, "bin")})
	}
	if _, err := os.Stat("factorio-server-console.log"); err == nil {
		migrations = append(migrations, struct{ src, dst string }{"factorio-server-console.log", filepath.Join(defaultDir, "factorio-server-console.log")})
	}

	for _, m := range migrations {
		if _, err := os.Stat(m.src); os.IsNotExist(err) {
			continue
		}
		log.Printf("Moving %s -> %s", m.src, m.dst)
		if err := os.Rename(m.src, m.dst); err != nil {
			if cpErr := copyAndRemove(m.src, m.dst); cpErr != nil {
				return fmt.Errorf("failed to move %s: %w", m.src, cpErr)
			}
		}
	}

	if _, err := os.Stat("data"); err == nil {
		log.Println("Copying data/ -> instances/default/data/")
		if err := copyDir("data", filepath.Join(defaultDir, "data")); err != nil {
			log.Printf("Warning: failed to copy data/: %v", err)
		}
	}

	meta := InstanceMetadata{
		Name:        "default",
		DisplayName: "Default",
		GamePort:    34197,
		RconPort:    randomPortRange(40000, 45000),
		BindIP:      "0.0.0.0",
		Autostart:   false,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	binaryPath := filepath.Join(defaultDir, "bin", "x64", "factorio")
	if _, err := os.Stat(binaryPath); err == nil {
		if v, err := extractBinaryVersion(binaryPath); err == nil {
			meta.FactorioVersion = v
		}
	}

	metaPath := filepath.Join(defaultDir, "instance.json")
	metaData, _ := json.MarshalIndent(meta, "", "  ")
	if err := os.WriteFile(metaPath, metaData, 0644); err != nil {
		return fmt.Errorf("failed to write instance.json: %w", err)
	}
	if err := os.WriteFile(sentinelFile, []byte("migrated"), 0644); err != nil {
		log.Printf("Warning: failed to write sentinel: %v", err)
	}

	log.Println("Migration completed successfully")
	return nil
}

func copyAndRemove(src, dst string) error {
	if err := copyDir(src, dst); err != nil {
		return err
	}
	return os.RemoveAll(src)
}

func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			srcFile, err := os.Open(srcPath)
			if err != nil {
				return err
			}
			dstFile, err := os.Create(dstPath)
			if err != nil {
				srcFile.Close()
				return err
			}
			_, err = io.Copy(dstFile, srcFile)
			srcFile.Close()
			dstFile.Close()
			if err != nil {
				return err
			}
		}
	}
	return nil
}
