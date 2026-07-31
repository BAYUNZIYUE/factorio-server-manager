package factorio

import (
	"log"

	"github.com/OpenFactorioServerManager/factorio-server-manager/bootstrap"
	"github.com/hpcloud/tail"
)

func TailLog() ([]string, error) {
	config := bootstrap.GetConfig()
	return TailLogFile(config.FactorioLog)
}

func TailLogFile(path string) ([]string, error) {
	result := []string{}

	t, err := tail.TailFile(path, tail.Config{Follow: false})
	if err != nil {
		log.Printf("Error tailing log %s", err)
		return result, err
	}

	for line := range t.Lines {
		result = append(result, line.Text)
	}

	return result, nil
}
