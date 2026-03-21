package model

import (
	"fmt"
	"regexp"
	"strings"
)

const (
	StatusActive   = "Active"
	StatusHiring   = "Hiring"
	StatusOpen     = "Open"
	StatusTransfer = "Transfer"
)

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9_]`)

type Person struct {
	Name            string
	Role            string
	Discipline      string
	Manager         string
	Team            string
	AdditionalTeams []string
	Status          string
	NewRole         string
	NewTeam         string
}

type Org struct {
	People    []Person
	ByName    map[string]*Person
	ByTeam    map[string][]*Person
	ByManager map[string][]*Person
	Roots     []*Person
}

func NewOrg(people []Person) (*Org, error) {
	validStatuses := map[string]bool{StatusActive: true, StatusHiring: true, StatusOpen: true, StatusTransfer: true}
	for i, p := range people {
		row := i + 2
		if p.Name == "" {
			return nil, fmt.Errorf("row %d: missing 'Name'", row)
		}
		if p.Team == "" {
			return nil, fmt.Errorf("row %d: missing 'Team'", row)
		}
		if p.Status == "" {
			return nil, fmt.Errorf("row %d: missing 'Status'", row)
		}
		if !validStatuses[p.Status] {
			return nil, fmt.Errorf("row %d: status must be Active, Hiring, Open, or Transfer (got '%s')", row, p.Status)
		}
		// Role and Discipline are optional for Transfer status
		if p.Status != StatusTransfer {
			if p.Role == "" {
				return nil, fmt.Errorf("row %d: missing 'Role'", row)
			}
			if p.Discipline == "" {
				return nil, fmt.Errorf("row %d: missing 'Discipline'", row)
			}
		}
	}

	org := &Org{
		People:    people,
		ByName:    make(map[string]*Person),
		ByTeam:    make(map[string][]*Person),
		ByManager: make(map[string][]*Person),
	}

	for i := range org.People {
		p := &org.People[i]
		if _, exists := org.ByName[p.Name]; exists {
			return nil, fmt.Errorf("duplicate name '%s'", p.Name)
		}
		org.ByName[p.Name] = p
	}

	for i := range org.People {
		p := &org.People[i]
		org.ByTeam[p.Team] = append(org.ByTeam[p.Team], p)

		if p.Manager == "" {
			org.Roots = append(org.Roots, p)
		} else {
			if _, exists := org.ByName[p.Manager]; !exists {
				return nil, fmt.Errorf("manager '%s' not found (referenced by '%s')", p.Manager, p.Name)
			}
			org.ByManager[p.Manager] = append(org.ByManager[p.Manager], p)
		}
	}

	// Detect cycles with three-color DFS: 0=unvisited, 1=in-stack, 2=done
	color := make(map[string]int, len(org.People))
	for i := range org.People {
		p := &org.People[i]
		if color[p.Name] != 0 || p.Manager == "" {
			continue
		}
		// Walk up the manager chain from this person
		current := p.Name
		for current != "" && color[current] == 0 {
			color[current] = 1 // in-stack
			mgr := org.ByName[current]
			current = mgr.Manager
		}
		if current != "" && color[current] == 1 {
			return nil, fmt.Errorf("circular reporting chain detected involving '%s'", current)
		}
		// Mark entire chain as done
		walk := p.Name
		for walk != "" && color[walk] == 1 {
			color[walk] = 2
			mgr := org.ByName[walk]
			walk = mgr.Manager
		}
	}

	return org, nil
}

// ApplyPlanned swaps NewRole/NewTeam into Role/Team for people who have them,
// then rebuilds the Org indexes. Returns a new Org.
func ApplyPlanned(org *Org) (*Org, error) {
	people := make([]Person, len(org.People))
	copy(people, org.People)
	for i := range people {
		if people[i].NewRole != "" {
			people[i].Role = people[i].NewRole
		}
		if people[i].NewTeam != "" {
			people[i].Team = people[i].NewTeam
		}
	}
	return NewOrg(people)
}

type IDGenerator struct {
	seen    map[string]int
	openSeq int
}

func NewIDGenerator() *IDGenerator {
	return &IDGenerator{seen: make(map[string]int)}
}

func (g *IDGenerator) ID(name string) string {
	base := strings.ToLower(name)
	base = strings.ReplaceAll(base, " ", "_")
	base = nonAlphaNum.ReplaceAllString(base, "")
	for strings.Contains(base, "__") {
		base = strings.ReplaceAll(base, "__", "_")
	}
	base = strings.Trim(base, "_")

	g.seen[base]++
	if g.seen[base] == 1 {
		return base
	}
	return fmt.Sprintf("%s_%d", base, g.seen[base])
}

func (g *IDGenerator) OpenID() string {
	g.openSeq++
	return fmt.Sprintf("open_%d", g.openSeq)
}
