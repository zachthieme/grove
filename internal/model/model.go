package model

import "fmt"

type Person struct {
	Name            string
	Role            string
	Discipline      string
	Manager         string
	Team            string
	AdditionalTeams []string
	Status          string
}

type Org struct {
	People    []Person
	ByName    map[string]*Person
	ByTeam    map[string][]*Person
	ByManager map[string][]*Person
	Roots     []*Person
}

func NewOrg(people []Person) (*Org, error) {
	validStatuses := map[string]bool{"Active": true, "Hiring": true, "Open": true}
	for i, p := range people {
		row := i + 2
		if p.Name == "" {
			return nil, fmt.Errorf("row %d: missing 'Name'", row)
		}
		if p.Role == "" {
			return nil, fmt.Errorf("row %d: missing 'Role'", row)
		}
		if p.Discipline == "" {
			return nil, fmt.Errorf("row %d: missing 'Discipline'", row)
		}
		if p.Team == "" {
			return nil, fmt.Errorf("row %d: missing 'Team'", row)
		}
		if p.Status == "" {
			return nil, fmt.Errorf("row %d: missing 'Status'", row)
		}
		if !validStatuses[p.Status] {
			return nil, fmt.Errorf("row %d: status must be Active, Hiring, or Open (got '%s')", row, p.Status)
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

	for i := range org.People {
		p := &org.People[i]
		if p.Manager == "" {
			continue
		}
		visited := map[string]bool{p.Name: true}
		current := p.Manager
		for current != "" {
			if visited[current] {
				return nil, fmt.Errorf("circular reporting chain detected involving '%s'", current)
			}
			visited[current] = true
			mgr := org.ByName[current]
			current = mgr.Manager
		}
	}

	return org, nil
}
