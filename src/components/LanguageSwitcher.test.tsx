import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { initialLanguage, LANGUAGE_STORAGE_KEY } from '@/lib/language';
import { LanguageSwitcher } from './LanguageSwitcher';

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

describe('language choice (story 6.2)', () => {
  it('starts in the language remembered on the device, ignoring anything else', () => {
    expect(initialLanguage()).toBe('en'); // tests run in English
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(initialLanguage()).toBe('fr');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    expect(initialLanguage()).toBe('en');
  });

  it('starts in French on a new device (outside the test mode)', () => {
    vi.stubEnv('MODE', 'production');
    expect(initialLanguage()).toBe('fr');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(initialLanguage()).toBe('en');
    vi.unstubAllEnvs();
  });

  it('switches the interface to French and remembers it', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>
    );
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'fr');
    expect(i18n.language).toBe('fr');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
    expect(i18n.t('buttons.save', { ns: 'common' })).not.toBe('Save');
    expect(screen.getByLabelText('Langue')).toBeInTheDocument();
  });

  it('keeps the rules data in English whatever the interface language', async () => {
    const english = i18n.t('classes.wizard', { ns: 'gamedata', lng: 'en' });
    await i18n.changeLanguage('fr');
    expect(i18n.t('classes.wizard', { ns: 'gamedata' })).toBe(english);
  });
});
