import { act, render, screen, waitFor } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { createWrapper, setupMockReset } from '@/test/hook-test-helpers';
import { mockQueryResult } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase', () => import('@/test/mocks/supabase'));

import i18n from '@/lib/i18n';
import { RuleSetProvider, useRuleName } from '@/hooks/useRuleSet';

setupMockReset();

function Sample() {
  const { t } = useTranslation('gamedata');
  const name = useRuleName();
  return (
    <ul>
      <li data-testid="ability">{t('abilities.str')}</li>
      <li data-testid="skill">{t('skills.animalhandling')}</li>
      <li data-testid="alignment">{t('alignments.lg')}</li>
      <li data-testid="gender">{t('gender.male')}</li>
      <li data-testid="damage">{t('damageTypes.fire')}</li>
      <li data-testid="school">{t('schools.evocation')}</li>
      <li data-testid="size">{t('sizes.small')}</li>
      <li data-testid="language">{t('languages.sylvan')}</li>
      <li data-testid="nonbinary">{t('gender.nonbinary')}</li>
      <li data-testid="species">{name('species', 'half-orc')}</li>
      <li data-testid="class">{name('class', 'fighter')}</li>
      <li data-testid="spell">{name('spell', 'fireball')}</li>
      <li data-testid="armor">{t('armor.medium-nonmetal')}</li>
    </ul>
  );
}

function renderSample(ruleset: '2014' | '2024') {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <RuleSetProvider ruleset={ruleset}>
        <Sample />
      </RuleSetProvider>
    </Wrapper>
  );
}

describe('French 2014 labels at render (D-39)', () => {
  beforeEach(async () => {
    mockQueryResult.data = [];
    await act(() => i18n.changeLanguage('fr'));
  });
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('shows French labels for a 2014 campaign, English where the table has nothing', async () => {
    renderSample('2014');
    await waitFor(() => expect(screen.getByTestId('ability')).toBeInTheDocument());
    const text = (id: string) => screen.getByTestId(id).textContent;
    expect(text('ability')).toBe('Force');
    expect(text('skill')).toBe('Dressage');
    expect(text('alignment')).toBe('Loyal bon');
    expect(text('gender')).toBe('Masculin');
    expect(text('damage')).toBe('Feu');
    expect(text('school')).toBe('Évocation');
    expect(text('size')).toBe('Petite (P)');
    expect(text('language')).toBe('Sylvain');
    expect(text('species')).toBe('Demi-ore');
    expect(text('class')).toBe('Guerrier');
    // Not in the table: falls back to English, never a raw id or key.
    expect(text('nonbinary')).toBe('Non-Binary');
    expect(text('armor')).toBe('Medium (nonmetal)');
    expect(text('spell')).toBe('Fireball');
  });

  it('leaves 2024 untouched, and the shared bundle too', async () => {
    renderSample('2024');
    await waitFor(() => expect(screen.getByTestId('ability')).toBeInTheDocument());
    expect(screen.getByTestId('ability').textContent).toBe('Strength');
    expect(screen.getByTestId('alignment').textContent).toBe('Lawful Good');
    expect(i18n.t('abilities.str', { ns: 'gamedata' })).toBe('Strength');
  });

  it('stays English when the interface is English, even for 2014', async () => {
    await act(() => i18n.changeLanguage('en'));
    renderSample('2014');
    await waitFor(() => expect(screen.getByTestId('ability')).toBeInTheDocument());
    expect(screen.getByTestId('ability').textContent).toBe('Strength');
    expect(screen.getByTestId('species').textContent).toBe('Half-Orc');
  });

  it('follows a language change made while mounted', async () => {
    await act(() => i18n.changeLanguage('en'));
    renderSample('2014');
    await waitFor(() => expect(screen.getByTestId('ability').textContent).toBe('Strength'));
    await act(() => i18n.changeLanguage('fr'));
    await waitFor(() => expect(screen.getByTestId('ability').textContent).toBe('Force'));
  });
});
