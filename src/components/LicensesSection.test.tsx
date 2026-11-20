import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { CC_BY_URL, LicensesSection, SRD_URL } from './LicensesSection';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

function renderSection() {
  return render(
    <I18nextProvider i18n={i18n}>
      <LicensesSection />
    </I18nextProvider>
  );
}

describe('LicensesSection (story 9.5)', () => {
  it('shows the SRD 5.1 attribution with links to the SRD and to the CC-BY 4.0 license', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: 'Licenses' })).toBeInTheDocument();
    expect(
      screen.getByText(/System Reference Document 5\.1 \("SRD 5\.1"\) by Wizards of the Coast LLC/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Creative Commons Attribution 4\.0 International License/)).toBeInTheDocument();
    const srd = screen.getByRole('link', { name: SRD_URL });
    expect(srd).toHaveAttribute('href', SRD_URL);
    expect(srd).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: CC_BY_URL })).toHaveAttribute('href', CC_BY_URL);
  });

  it('is translated into French', async () => {
    await i18n.changeLanguage('fr');
    renderSection();
    expect(screen.getByRole('heading', { name: 'Licences' })).toBeInTheDocument();
    expect(screen.getByText(/de Wizards of the Coast LLC/)).toBeInTheDocument();
  });
});
