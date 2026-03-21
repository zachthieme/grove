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
	hasTransfer := false

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
		switch p.Status {
		case model.StatusHiring, model.StatusOpen, model.StatusTransfer:
			nameToID[p.Name] = ids.OpenID()
		default:
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
			roleText := p.Role
			if roleText == "" {
				roleText = "TBD"
			}
			label := fmt.Sprintf("%s<br/><i>%s</i>", p.Name, roleText)
			nodeClass := ""
			switch p.Status {
			case model.StatusHiring, model.StatusOpen:
				nodeClass = classHiring
				hasHiring = true
				label = fmt.Sprintf("🔵 %s<br/><i>%s</i>", p.Name, roleText)
			case model.StatusTransfer:
				nodeClass = classTransfer
				hasTransfer = true
				label = fmt.Sprintf("🟡 %s<br/><i>%s</i>", p.Name, roleText)
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
	if hasTransfer {
		vm.ClassDefs = append(vm.ClassDefs, classDefTransfer)
	}

	return vm
}
