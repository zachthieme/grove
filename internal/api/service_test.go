package api

import (
	"testing"
)

func newTestService(t *testing.T) *OrgService {
	t.Helper()
	svc := NewOrgService()
	csv := []byte("Name,Role,Discipline,Manager,Team,Additional Teams,Status\nAlice,VP,Eng,,Eng,,Active\nBob,Engineer,Eng,Alice,Platform,,Active\nCarol,Engineer,Eng,Bob,Platform,,Active\n")
	if err := svc.Upload("test.csv", csv); err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	return svc
}

func TestOrgService_Upload(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	if data == nil {
		t.Fatal("expected org data after upload")
	}
	if len(data.Original) != 3 {
		t.Errorf("expected 3 original people, got %d", len(data.Original))
	}
	if len(data.Working) != 3 {
		t.Errorf("expected 3 working people, got %d", len(data.Working))
	}
	if data.Original[0].Id != data.Working[0].Id {
		t.Error("expected original and working to share IDs")
	}
}

func TestOrgService_Move(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	carol := findByName(data.Working, "Carol")
	alice := findByName(data.Working, "Alice")

	err := svc.Move(carol.Id, alice.Id, "Eng")
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}

	working := svc.GetWorking()
	updated := findById(working, carol.Id)
	if updated.ManagerId != alice.Id {
		t.Errorf("expected Carol's manager to be Alice, got %s", updated.ManagerId)
	}
	if updated.Team != "Eng" {
		t.Errorf("expected Carol's team to be Eng, got %s", updated.Team)
	}

	origCarol := findByName(svc.GetOrg().Original, "Carol")
	if origCarol.Team == "Eng" {
		t.Error("expected original Carol to still be on Platform")
	}
}

func TestOrgService_Update(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")

	err := svc.Update(bob.Id, map[string]string{"role": "Senior Engineer", "discipline": "SRE"})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	working := svc.GetWorking()
	updated := findById(working, bob.Id)
	if updated.Role != "Senior Engineer" {
		t.Errorf("expected role 'Senior Engineer', got '%s'", updated.Role)
	}
	if updated.Discipline != "SRE" {
		t.Errorf("expected discipline 'SRE', got '%s'", updated.Discipline)
	}
}

func TestOrgService_Add(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	alice := findByName(data.Working, "Alice")

	added := svc.Add(Person{
		Name: "Dave", Role: "Engineer", Discipline: "Eng",
		ManagerId: alice.Id, Team: "Eng", Status: "Active",
	})

	if added.Id == "" {
		t.Error("expected added person to have an ID")
	}

	working := svc.GetWorking()
	if len(working) != 4 {
		t.Errorf("expected 4 people, got %d", len(working))
	}
}

func TestOrgService_Delete(t *testing.T) {
	svc := newTestService(t)
	data := svc.GetOrg()
	bob := findByName(data.Working, "Bob")
	carol := findByName(data.Working, "Carol")

	err := svc.Delete(bob.Id)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	working := svc.GetWorking()
	if len(working) != 2 {
		t.Errorf("expected 2 people, got %d", len(working))
	}

	updatedCarol := findById(working, carol.Id)
	if updatedCarol == nil {
		t.Fatal("expected Carol to still exist")
	}
	if updatedCarol.ManagerId != "" {
		t.Errorf("expected Carol to be unparented, got managerId %s", updatedCarol.ManagerId)
	}
}

func findById(people []Person, id string) *Person {
	for i := range people {
		if people[i].Id == id {
			return &people[i]
		}
	}
	return nil
}
