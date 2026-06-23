package factorio

import "testing"

func TestGEC_Server2_1(t *testing.T) {
	server := &Version{2, 1, 0, 0}
	
	tests := []struct{
		modVersion Version
		expect bool
		desc string
	}{
		{Version{2, 1, 0, 0}, true, "exact same 2.1.0.0"},
		{Version{2, 1, 5, 0}, false, "mod newer 2.1.5.0"},
		{Version{2, 0, 0, 0}, false, "mod 2.0.0.0 on 2.1 server"},
		{Version{1, 1, 0, 0}, false, "mod 1.1.0.0 on 2.1 server"},
		{Version{0, 18, 0, 0}, false, "mod 0.18.0.0 on 2.1 server"},
	}
	
	for _, tt := range tests {
		got := server.GEC(tt.modVersion)
		if got != tt.expect {
			t.Errorf("%s: GEC() = %v, want %v", tt.desc, got, tt.expect)
		}
	}
}

func TestGEC_Server2_0(t *testing.T) {
	server := &Version{2, 0, 0, 0}
	
	tests := []struct{
		modVersion Version
		expect bool
		desc string
	}{
		{Version{2, 0, 0, 0}, true, "exact match 2.0.0.0"},
		{Version{2, 0, 5, 0}, false, "mod 2.0.5.0 on 2.0.0 server (newer)"},
		{Version{2, 0, 20, 0}, false, "mod 2.0.20.0 on 2.0.0 server (newer)"},
		{Version{1, 1, 0, 0}, false, "mod 1.1.0.0 on 2.0 server"},
	}
	
	for _, tt := range tests {
		got := server.GEC(tt.modVersion)
		if got != tt.expect {
			t.Errorf("%s: GEC() = %v, want %v", tt.desc, got, tt.expect)
		}
	}
}

func TestGEC_Server1_0(t *testing.T) {
	server := &Version{1, 0, 0, 0}
	
	tests := []struct{
		modVersion Version
		expect bool
		desc string
	}{
		{Version{1, 0, 0, 0}, true, "exact match"},
		{Version{0, 18, 0, 0}, true, "0.18 mod on 1.0 server (legacy compat)"},
	}
	
	for _, tt := range tests {
		got := server.GEC(tt.modVersion)
		if got != tt.expect {
			t.Errorf("%s: GEC() = %v, want %v", tt.desc, got, tt.expect)
		}
	}
}

func TestGreaterC_KeyCases(t *testing.T) {
	// GreaterC: compatible if same major.minor and server >= mod patch
	var s Version = Version{2, 0, 10, 0}
	if !s.GreaterC(Version{2, 0, 5, 0}) {
		t.Error("2.0.10 should be compatible with 2.0.5")
	}
	if s.GreaterC(Version{2, 0, 15, 0}) {
		t.Error("2.0.10 should NOT be compatible with 2.0.15 (server older)")
	}
	if s.GreaterC(Version{2, 1, 0, 0}) {
		t.Error("2.0.10 should NOT be compatible with 2.1.0 (different minor)")
	}
}
