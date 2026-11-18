/**
 * Render tests for the rules edition card of CampaignDashboard (story 9.1): the DM picks 2014 or 2024, and the picker
 * is frozen once a character is finalized (the database refuses the change too).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Campaign } from '@/types/database';
import CampaignDashboard from '@/pages/CampaignDashboard';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string) => key.split('.').pop() ?? key,
    i18n: { language: 'en' },
    ns,
  }),
}));

const mockUpdateMutate = vi.fn();
let mockCampaign: Campaign | undefined;
let mockCharacters: { id: string; character_type: 'pc' | 'npc'; status: 'draft' | 'ready'; updated_at: string }[] = [];
let mockUpdateError = false;

vi.mock('@/hooks/useCampaigns', () => ({
  useCampaign: () => ({ data: mockCampaign, isLoading: false }),
  useCampaignMutations: () => ({
    update: {
      mutate: mockUpdateMutate,
      isPending: false,
      isError: mockUpdateError,
      variables: mockUpdateError ? { id: 'camp-1', ruleset: '2014' } : undefined,
    },
    create: { mutate: vi.fn() },
    archive: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/useCampaignContext', () => ({
  useCampaignContext: () => ({ campaignId: 'camp-1' }),
}));

vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: () => undefined,
}));

vi.mock('@/hooks/useCharacters', () => ({
  useCharacters: () => ({ data: mockCharacters, error: null }),
}));

vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({ data: [], error: null }),
}));

const makeCampaign = (overrides?: Partial<Campaign>): Campaign => ({
  id: 'camp-1',
  slug: 'test-campaign',
  previous_slugs: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  name: 'Test Campaign',
  status: 'active',
  description: null,
  setting: null,
  image_url: null,
  theme: null,
  archived_at: null,
  allowed_source_books: ['phb-2024'],
  ruleset: '2024',
  ...overrides,
});

const character = (status: 'draft' | 'ready') => ({
  id: `c-${status}`,
  character_type: 'pc' as const,
  status,
  updated_at: '2024-01-01T00:00:00Z',
});

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/campaign/test-campaign']}>
      <Routes>
        <Route path="/campaign/:campaignSlug" element={<CampaignDashboard />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CampaignDashboard: rules edition card', () => {
  beforeEach(() => {
    mockCampaign = makeCampaign();
    mockCharacters = [];
    mockUpdateError = false;
    mockUpdateMutate.mockClear();
  });

  it('shows both editions and marks the current one as pressed', () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: '2024' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2014' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the other edition when it is picked', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: '2014' }));
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'camp-1', ruleset: '2014' });
  });

  it('does nothing when the current edition is picked again', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('stays free while the only characters are drafts', () => {
    mockCharacters = [character('draft')];
    renderDashboard();
    expect(screen.getByRole('button', { name: '2014' })).not.toBeDisabled();
    expect(screen.queryByText('locked')).not.toBeInTheDocument();
  });

  it('freezes the picker and says why once a character is finalized', () => {
    mockCharacters = [character('draft'), character('ready')];
    renderDashboard();
    expect(screen.getByRole('button', { name: '2014' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2024' })).toBeDisabled();
    expect(screen.getByText('locked')).toBeInTheDocument();
  });

  it('warns that 2014 sheets are not available yet', () => {
    mockCampaign = makeCampaign({ ruleset: '2014' });
    renderDashboard();
    expect(screen.getByText('notReady')).toBeInTheDocument();
  });

  it('does not show the warning on a 2024 campaign', () => {
    renderDashboard();
    expect(screen.queryByText('notReady')).not.toBeInTheDocument();
  });

  it('shows an error when the change is refused', () => {
    mockUpdateError = true;
    renderDashboard();
    expect(screen.getByText('saveFailed')).toBeInTheDocument();
  });
});
