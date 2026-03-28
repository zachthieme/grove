package api

import (
	"context"
	"testing"
)

func BenchmarkFindWorking(b *testing.B) {
	svc := NewOrgService(NewMemorySnapshotStore())
	rows := "Name,Role,Discipline,Manager,Team,Status\n"
	rows += "Root,VP,Eng,,Eng,Active\n"
	for i := 0; i < 499; i++ {
		rows += "Person" + string(rune('A'+i%26)) + string(rune('0'+i/26)) + ",SWE,Eng,Root,Platform,Active\n"
	}
	_, _ = svc.Upload(context.Background(), "bench.csv", []byte(rows))
	data := svc.GetOrg(context.Background())
	lastId := data.Working[len(data.Working)-1].Id

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.mu.RLock()
		svc.findWorking(lastId)
		svc.mu.RUnlock()
	}
}
