package org

import (
	"context"

	"github.com/zachthieme/grove/internal/apitypes"
)

func (s *OrgService) GetSettings(ctx context.Context) apitypes.Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *OrgService) UpdateSettings(ctx context.Context, settings apitypes.Settings) (apitypes.Settings, error) {
	if err := validateSettings(&settings); err != nil {
		return apitypes.Settings{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	return s.settings, nil
}
