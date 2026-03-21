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
		if p.Status == model.StatusHiring || p.Status == model.StatusOpen {
			nameToID[p.Name] = ids.OpenID()
		} else {
			nameToID[p.Name] = ids.ID(p.Name)
		}
	}

	// Build set of root names for FreeNode placement
	rootSet := make(map[string]bool)
	for _, r := range org.Roots {
		rootSet[r.Name] = true
	}

	for _, team := range teamOrder {
		sg := Subgraph{Label: team}
		members := org.ByTeam[team]
		for _, p := range members {
			label := fmt.Sprintf("%s<br/><i>%s</i>", p.Name, p.Role)
			nodeClass := ""
			if p.Status == model.StatusHiring || p.Status == model.StatusOpen {
				nodeClass = classHiring
				hasHiring = true
				label = fmt.Sprintf("🔵 %s<br/><i>%s</i>", p.Name, p.Role)
			}
			node := Node{
				ID:    nameToID[p.Name],
				Label: label,
				Class: nodeClass,
			}
			if rootSet[p.Name] {
				vm.FreeNodes = append(vm.FreeNodes, node)
			} else {
				sg.Nodes = append(sg.Nodes, node)
			}
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
		vm.ClassDefs = append(vm.ClassDefs, classDefHiring)
	}

	return vm
}
