package views

import (
	"fmt"

	"github.com/zach/orgchart/internal/model"
)

func PeopleView(org *model.Org) ViewModel {
	ids := model.NewIDGenerator()
	vm := ViewModel{}

	nameToID := make(map[string]string)
	hasHiring := false

	teamOrder := []string{}
	teamSet := make(map[string]bool)
	for i := range org.People {
		p := &org.People[i]
		if !teamSet[p.Team] {
			teamSet[p.Team] = true
			teamOrder = append(teamOrder, p.Team)
		}
		for _, at := range p.AdditionalTeams {
			if !teamSet[at] {
				teamSet[at] = true
				teamOrder = append(teamOrder, at)
			}
		}
	}

	for i := range org.People {
		p := &org.People[i]
		if p.Status == "Hiring" || p.Status == "Open" {
			nameToID[p.Name] = ids.OpenID()
		} else {
			nameToID[p.Name] = ids.ID(p.Name)
		}
	}

	for _, team := range teamOrder {
		sg := Subgraph{Label: team}
		members := org.ByTeam[team]
		for _, p := range members {
			nodeClass := ""
			if p.Status == "Hiring" || p.Status == "Open" {
				nodeClass = "hiring"
				hasHiring = true
			}
			sg.Nodes = append(sg.Nodes, Node{
				ID:    nameToID[p.Name],
				Label: fmt.Sprintf("%s<br/><i>%s</i>", p.Name, p.Role),
				Class: nodeClass,
			})
		}
		if len(sg.Nodes) > 0 {
			vm.Subgraphs = append(vm.Subgraphs, sg)
		}
	}

	for i := range org.People {
		p := &org.People[i]
		if p.Manager == "" {
			continue
		}
		vm.Edges = append(vm.Edges, Edge{
			From:   nameToID[p.Manager],
			To:     nameToID[p.Name],
			Dotted: false,
		})
	}

	for i := range org.People {
		p := &org.People[i]
		for _, at := range p.AdditionalTeams {
			targetMembers := org.ByTeam[at]
			if len(targetMembers) > 0 {
				vm.Edges = append(vm.Edges, Edge{
					From:   nameToID[p.Name],
					To:     nameToID[targetMembers[0].Name],
					Dotted: true,
				})
			}
		}
	}

	if hasHiring {
		vm.ClassDefs = append(vm.ClassDefs, "classDef hiring stroke-dasharray: 5 5, stroke: #60a5fa")
	}

	return vm
}
