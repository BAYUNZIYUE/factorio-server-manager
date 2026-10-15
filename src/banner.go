package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/OpenFactorioServerManager/factorio-server-manager/factorio"
)

// localIP returns the preferred outbound address; no packets are sent.
func localIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "localhost"
	}
	defer conn.Close()
	if addr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return addr.IP.String()
	}
	return "localhost"
}

// printReadyBanner prints the access info (Windows only; on Linux entrypoint.sh does it).
func printReadyBanner(serverIP, port, dataDir string, servers []*factorio.Server) {
	if runtime.GOOS != "windows" {
		return
	}
	ip := serverIP
	if ip == "" || ip == "0.0.0.0" {
		ip = localIP()
	}
	line := strings.Repeat("=", 40)
	fmt.Println()
	fmt.Println(line)
	fmt.Println("  FSM is Ready!")
	fmt.Println(line)
	fmt.Printf("  URL:  http://%s:%s\n", ip, port)
	if len(servers) > 0 {
		lo, hi := servers[0].Port, servers[0].Port
		for _, s := range servers {
			if s.Port < lo {
				lo = s.Port
			}
			if s.Port > hi {
				hi = s.Port
			}
		}
		fmt.Printf("  UDP:  %d-%d/udp\n", lo, hi)
	}
	fmt.Println("  User: admin")
	if data, err := os.ReadFile(filepath.Join(dataDir, "admin-credentials.txt")); err == nil {
		if pass := strings.TrimSpace(string(data)); pass != "" {
			fmt.Printf("  Pass: %s\n", pass)
			fmt.Println("  (initial password, change after login)")
		}
	}
	fmt.Println(strings.Repeat("-", 40))
	fmt.Println()
}
