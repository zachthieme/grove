package org

import (
	"context"
	"strings"
	"testing"

	"pgregory.net/rapid"

	"github.com/zachthieme/grove/internal/apitypes"
	"github.com/zachthieme/grove/internal/snapshot"
)

// Scenarios: ORG-001
//
// Property tests run random sequences of mutations and assert the
// invariants hold after every step. They complement the example-based
// tests in service_test.go: examples prove specific behaviors;
// properties prove that the invariants hold across the input space
// rapid can generate.
//
// Failures replay deterministically — rapid's seed is printed on
// failure so the failing sequence is reproducible.

// invariants asserts the set of system-wide invariants on an OrgService
// at rest (no operation in flight). Called after every random op.
func invariants(t *rapid.T, svc *OrgService) {
	t.Helper()
	data := svc.GetOrg(context.Background())
	if data == nil {
		// Not yet imported — only valid before any successful upload.
		return
	}

	working := data.Working
	recycled := svc.GetRecycled(context.Background())

	// 1. Working IDs are unique.
	seen := make(map[string]bool, len(working))
	for _, p := range working {
		if seen[p.Id] {
			t.Fatalf("invariant: duplicate id in working: %q", p.Id)
		}
		seen[p.Id] = true
	}

	// 2. Recycled IDs are unique and disjoint from working.
	recSeen := make(map[string]bool, len(recycled))
	for _, p := range recycled {
		if recSeen[p.Id] {
			t.Fatalf("invariant: duplicate id in recycled: %q", p.Id)
		}
		recSeen[p.Id] = true
		if seen[p.Id] {
			t.Fatalf("invariant: id in both working and recycled: %q", p.Id)
		}
	}

	// 3. Every ManagerId points to a working person, or is empty.
	for _, p := range working {
		if p.ManagerId == "" {
			continue
		}
		if !seen[p.ManagerId] {
			t.Fatalf("invariant: %q's ManagerId %q not in working", p.Id, p.ManagerId)
		}
	}

	// 4. No reporting cycles. Walk each person's ancestor chain; bound by
	//    len(working) so a cycle is detected as soon as we'd revisit.
	idIndex := make(map[string]int, len(working))
	for i, p := range working {
		idIndex[p.Id] = i
	}
	for _, start := range working {
		visited := map[string]bool{start.Id: true}
		current := start.ManagerId
		hops := 0
		for current != "" {
			hops++
			if hops > len(working)+1 {
				t.Fatalf("invariant: cycle suspected from %q (hops=%d)", start.Id, hops)
			}
			if visited[current] {
				t.Fatalf("invariant: cycle from %q via %q", start.Id, current)
			}
			visited[current] = true
			idx, ok := idIndex[current]
			if !ok {
				break // dangling — already covered by invariant 3
			}
			current = working[idx].ManagerId
		}
	}

	// 5. Every pod's ManagerId points to a working person.
	for _, pd := range data.Pods {
		if !seen[pd.ManagerId] {
			t.Fatalf("invariant: pod %q references missing manager %q", pd.Id, pd.ManagerId)
		}
	}
}

// pickID picks a random ID from working. Returns "" if working is empty.
func pickID(t *rapid.T, svc *OrgService) string {
	working := svc.GetOrg(context.Background()).Working
	if len(working) == 0 {
		return ""
	}
	idx := rapid.IntRange(0, len(working)-1).Draw(t, "idx")
	return working[idx].Id
}

func pickRecycledID(t *rapid.T, svc *OrgService) string {
	recycled := svc.GetRecycled(context.Background())
	if len(recycled) == 0 {
		return ""
	}
	idx := rapid.IntRange(0, len(recycled)-1).Draw(t, "ridx")
	return recycled[idx].Id
}

// nameGen generates short non-empty names without trailing whitespace.
var nameGen = rapid.StringMatching(`[A-Za-z][A-Za-z0-9 _-]{0,29}`).
	Filter(func(s string) bool {
		return strings.TrimSpace(s) != ""
	})

// Scenarios: ORG-001
//
// Random op sequences against a seeded org. After every op, all
// system-wide invariants must hold (uniqueness, disjoint working/recycled,
// no dangling managers, no cycles, valid pod refs).
func TestProperty_OrgInvariants(t *testing.T) {
	t.Parallel()
	rapid.Check(t, func(t *rapid.T) {
		svc := New(snapshot.NewMemoryStore())
		csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Eng,Eng,Alice,Eng,Active\nCarol,Eng,Eng,Bob,Eng,Active\nDan,Eng,Eng,Alice,Platform,Active\n")
		if _, err := svc.Upload(context.Background(), "seed.csv", csv); err != nil {
			t.Fatalf("seed upload: %v", err)
		}

		// Apply 1–25 random ops; invariants check after each.
		nOps := rapid.IntRange(1, 25).Draw(t, "nOps")
		for op := range nOps {
			invariants(t, svc)
			choice := rapid.IntRange(0, 5).Draw(t, "op")
			switch choice {
			case 0: // Move
				id := pickID(t, svc)
				newMgr := pickID(t, svc)
				if id == "" || id == newMgr {
					continue
				}
				_, _ = svc.Move(context.Background(), id, newMgr, "Eng", "")
			case 1: // Add
				name := nameGen.Draw(t, "name")
				node := apitypes.OrgNode{ManagerId: pickID(t, svc)}
				node.Name = name
				node.Status = "Active"
				node.Team = "Eng"
				_, _, _, _ = svc.Add(context.Background(), node)
			case 2: // AddParent
				id := pickID(t, svc)
				if id == "" {
					continue
				}
				name := nameGen.Draw(t, "pname")
				_, _, _, _ = svc.AddParent(context.Background(), id, name)
			case 3: // Delete
				id := pickID(t, svc)
				if id == "" {
					continue
				}
				_, _ = svc.Delete(context.Background(), id)
			case 4: // Restore
				id := pickRecycledID(t, svc)
				if id == "" {
					continue
				}
				_, _ = svc.Restore(context.Background(), id)
			case 5: // Reorder a random subset of working
				working := svc.GetOrg(context.Background()).Working
				if len(working) == 0 {
					continue
				}
				ids := make([]string, len(working))
				for i, p := range working {
					ids[i] = p.Id
				}
				_, _ = svc.Reorder(context.Background(), ids)
			}
			_ = op
		}
		invariants(t, svc)
	})
}

// Scenarios: ORG-001
//
// Specifically targets the diff invariant: regardless of mutations,
// Original is immutable (never touched once seeded).
func TestProperty_OriginalImmutable(t *testing.T) {
	t.Parallel()
	rapid.Check(t, func(t *rapid.T) {
		svc := New(snapshot.NewMemoryStore())
		csv := []byte("Name,Role,Discipline,Manager,Team,Status\nAlice,VP,Eng,,Eng,Active\nBob,Eng,Eng,Alice,Eng,Active\n")
		if _, err := svc.Upload(context.Background(), "seed.csv", csv); err != nil {
			t.Fatalf("seed upload: %v", err)
		}
		original := svc.GetOrg(context.Background()).Original
		originalSnapshot := make([]apitypes.OrgNode, len(original))
		copy(originalSnapshot, original)

		// Random ops.
		nOps := rapid.IntRange(0, 15).Draw(t, "nOps")
		for range nOps {
			id := pickID(t, svc)
			switch rapid.IntRange(0, 2).Draw(t, "op") {
			case 0:
				if id != "" {
					_, _ = svc.Delete(context.Background(), id)
				}
			case 1:
				if id != "" {
					name := nameGen.Draw(t, "n")
					_, _, _, _ = svc.AddParent(context.Background(), id, name)
				}
			case 2:
				if id != "" {
					_, _ = svc.Move(context.Background(), id, pickID(t, svc), "Platform", "")
				}
			}
		}

		afterOps := svc.GetOrg(context.Background()).Original
		if len(afterOps) != len(originalSnapshot) {
			t.Fatalf("invariant: Original length changed: %d → %d", len(originalSnapshot), len(afterOps))
		}
		for i, p := range originalSnapshot {
			if afterOps[i].Id != p.Id || afterOps[i].Name != p.Name || afterOps[i].ManagerId != p.ManagerId {
				t.Fatalf("invariant: Original mutated at index %d: %+v → %+v", i, p, afterOps[i])
			}
		}
	})
}
