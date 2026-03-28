package api

import "context"

func (s *OrgService) GetSettings(ctx context.Context) Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *OrgService) UpdateSettings(ctx context.Context, settings Settings) (Settings, error) {
	if err := validateSettings(&settings); err != nil {
		return Settings{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	return s.settings, nil
}
