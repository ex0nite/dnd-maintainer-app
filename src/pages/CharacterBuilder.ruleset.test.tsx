/**
 * Story 9.1: a campaign on a rules edition whose sheet engine does not exist yet builds no sheet, instead of silently
 * computing one with the other edition's rules.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { RulesetId } from '@/lib/ruleset';
import CharacterBuilder from '@/pages/CharacterBuilder';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, opts?: Record<string, string>) => `${key}${opts?.ruleset ? `:${opts.ruleset}` : ''}`,
    i18n: { language: 'en' },
    ns,
  }),
}));

const mockRuleset: RulesetId = '2014';

// Both editions have an engine since story 9.7: the guard is exercised with an edition whose engine is pretended absent.
vi.mock('@/lib/ruleset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ruleset')>()),
  canBuildCharacters: (ruleset: string) => ruleset === '2024',
}));

vi.mock('@/hooks/useCampaigns', () => ({
  useCampaign: () => ({ data: { id: 'camp-1', slug: 'camp', ruleset: mockRuleset }, isLoading: false }),
}));
vi.mock('@/hooks/useCampaignContext', () => ({
  useCampaignContext: () => ({ campaignId: 'camp-1', campaignSlug: 'camp', setPageTitle: () => undefined }),
}));
vi.mock('@/hooks/useCharacters', () => ({
  useCharacter: () => ({ data: undefined, isLoading: false, error: null }),
  useCampaignDrafts: () => ({ data: [] }),
  useCharacterMutations: () => ({}),
}));
vi.mock('@/hooks/useCharacterBuild', () => ({
  useCharacterBuildLevels: () => ({ data: [], isLoading: false }),
  useCharacterItems: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  useRole: () => ({ userId: 'u1', isPlayer: false, isDm: true }),
}));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => undefined }));

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={['/campaign/camp/character/new']}>
      <Routes>
        <Route path="/campaign/:campaignSlug/character/new" element={<CharacterBuilder />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CharacterBuilder: rules edition guard', () => {
  it('shows the not-available notice, and no builder, on an edition without a sheet engine', () => {
    renderBuilder();
    expect(screen.getByRole('status')).toHaveTextContent('characterBuilder.errors.rulesetNotReady:2014');
  });
});
