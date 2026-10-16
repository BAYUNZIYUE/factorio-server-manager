package factorio

import (
	"bytes"
	"os"
	"strings"

)

const maxTailLogLines = 200

func TailLogFile(logFile string) ([]string, error) {
	data, err := os.ReadFile(logFile)
	if err != nil {
		return []string{}, err
	}
	data = bytes.TrimRight(data, "\r\n")
	if len(data) == 0 {
		return []string{}, nil
	}

	lines := bytes.Split(data, []byte("\n"))
	start := 0
	if len(lines) > maxTailLogLines {
		start = len(lines) - maxTailLogLines
	}
	result := make([]string, 0, len(lines)-start)
	for _, line := range lines[start:] {
		result = append(result, strings.TrimRight(string(line), "\r"))
	}
	return result, nil
}
