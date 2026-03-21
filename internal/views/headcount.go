package views

import (
	"fmt"
	"sort"
	"strings"

	"github.com/zach/orgchart/internal/model"
)

func HeadcountView(org *model.Org) ViewModel {
	vm := ViewModel{}
	hasHiring := false

	teamOrder := []string{}
	teamSet := make(map[string]bool)
	for i := range org.People {
		p := &org.People[i]
		if !teamSet[p.Team] {
			teamSet[p.Team] = true
			teamOrder = append(teamOrder, p.Team)
		}
	}

	var crossTeamPeople []*model.Person
	crossTeamSeen := make(map[string]bool)
	idCounter := 0

	for _, team := range teamOrder {
		members := org.ByTeam[team]

		activeCounts := make(map[string]int)
		hiringCount := 0

		for _, p := range members {
			if p.Status == model.StatusActive {
				activeCounts[p.Discipline]++
			} else {
				hiringCount++
			}

			if len(p.AdditionalTeams) > 0 && !crossTeamSeen[p.Name] {
				crossTeamSeen[p.Name] = true
				crossTeamPeople = append(crossTeamPeople, p)
			}
		}

		sg := Subgraph{Label: team}

		disciplines := make([]string, 0, len(activeCounts))
		for d := range activeCounts {
			disciplines = append(disciplines, d)
		}
		sort.Strings(disciplines)

		for _, d := range disciplines {
			idCounter++
			sg.Nodes = append(sg.Nodes, Node{
				ID:    fmt.Sprintf("n_%d", idCounter),
				Label: fmt.Sprintf("%s: %d", d, activeCounts[d]),
			})
		}

		if hiringCount > 0 {
			hasHiring = true
			idCounter++
			sg.Nodes = append(sg.Nodes, Node{
				ID:    fmt.Sprintf("n_%d", idCounter),
				Label: fmt.Sprintf("🔵 Hiring: %d", hiringCount),
				Class: classHiring,
			})
		}

		if len(sg.Nodes) > 0 {
			vm.Subgraphs = append(vm.Subgraphs, sg)
		}
	}

	if len(crossTeamPeople) > 0 {
		sg := Subgraph{Label: "Cross-Team"}
		discPeople := make(map[string][]*model.Person)
		for _, p := range crossTeamPeople {
			discPeople[p.Discipline] = append(discPeople[p.Discipline], p)
		}

		disciplines := make([]string, 0, len(discPeople))
		for d := range discPeople {
			disciplines = append(disciplines, d)
		}
		sort.Strings(disciplines)

		for _, d := range disciplines {
			people := discPeople[d]
			var allTeams []string
			teamsSeen := make(map[string]bool)
			for _, p := range people {
				if !teamsSeen[p.Team] {
					teamsSeen[p.Team] = true
					allTeams = append(allTeams, p.Team)
				}
				for _, at := range p.AdditionalTeams {
					if !teamsSeen[at] {
						teamsSeen[at] = true
						allTeams = append(allTeams, at)
					}
				}
			}
			idCounter++
			sg.Nodes = append(sg.Nodes, Node{
				ID:    fmt.Sprintf("n_%d", idCounter),
				Label: fmt.Sprintf("%s: %d<br/><i>%s</i>", d, len(people), strings.Join(allTeams, ", ")),
			})
		}
		vm.Subgraphs = append(vm.Subgraphs, sg)
	}

	if hasHiring {
		vm.ClassDefs = append(vm.ClassDefs, classDefHiring)
	}

	return vm
}
