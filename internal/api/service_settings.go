package api

func (s *OrgService) GetSettings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *OrgService) UpdateSettings(settings Settings) Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	return s.settings
}
