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

	return org, nil
}
