package api

import (
	"github.com/google/uuid"
	"github.com/zach/orgchart/internal/model"
)

func ConvertOrg(org *model.Org) []Person {
	nameToID := make(map[string]string, len(org.People))
	for _, p := range org.People {
		nameToID[p.Name] = uuid.NewString()
	}

	result := make([]Person, len(org.People))
	for i, p := range org.People {
		result[i] = Person{
			Id:              nameToID[p.Name],
			Name:            p.Name,
			Role:            p.Role,
			Discipline:      p.Discipline,
			ManagerId:       nameToID[p.Manager],
			Team:            p.Team,
			AdditionalTeams: p.AdditionalTeams,
			Status:          p.Status,
			NewRole:         p.NewRole,
			NewTeam:         p.NewTeam,
		}
	}
	return result
}
