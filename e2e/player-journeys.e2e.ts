// Story 6.3 (FR24, NFR8): the player's journeys are walked to their end at 360 px, with no horizontal scroll at any
// step. The backend is stubbed (see support.ts): these checks cover what the screens do, not the database.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { stubBackend } from './support';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal scroll: ${scrollWidth}px of ${clientWidth}px`).toBeLessThanOrEqual(clientWidth);
}

test('sign in, then land on the table home', async ({ page }) => {
  await stubBackend(page, { signedIn: false, role: 'player', loginOk: true });
  await page.goto('/login');
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'My characters' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('change the password and continue', async ({ page }) => {
  await stubBackend(page, { signedIn: true, role: 'player' });
  await page.goto('/change-password');
  await page.getByLabel('New password', { exact: true }).fill('a-new-long-password-1');
  await page.getByLabel('Confirm the new password').fill('a-new-long-password-1');
  await expectNoHorizontalScroll(page);
  const update = page.waitForRequest((r) => r.url().includes('/auth/v1/user') && r.method() === 'PUT');
  await page.getByRole('button', { name: 'Save the password' }).click();
  expect((await update).postDataJSON()).toMatchObject({ password: 'a-new-long-password-1' });
  await expect(page.getByRole('heading', { name: 'My characters' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('start a character sheet', async ({ page }) => {
  await stubBackend(page, { signedIn: true, role: 'player' });
  await page.goto('/campaign/la-mine-perdue/character/new');
  const name = page.getByLabel('Character Name');
  await expect(name).toBeVisible();
  await name.fill('Thorin Oakenshield le très long nom de personnage');
  await expect(name).toHaveValue(/Thorin/);
  await expectNoHorizontalScroll(page);
});

test('write a shared note and a personal note', async ({ page }) => {
  const shared: Record<string, unknown>[] = [];
  const personal: Record<string, unknown>[] = [];
  const store = (list: Record<string, unknown>[]) => (request: import('@playwright/test').Request) => {
    if (request.method() === 'POST') {
      const note = {
        id: `n${list.length + 1}`,
        campaign_id: CAMPAIGN_ID,
        author_id: 'e2e-user',
        category: 'general',
        pinned: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...request.postDataJSON(),
      };
      list.unshift(note);
      return note;
    }
    return list;
  };
  await stubBackend(page, {
    signedIn: true,
    role: 'player',
    rest: { notes_shared: store(shared), notes_personal: store(personal) },
  });
  await page.goto('/campaign/la-mine-perdue/table-notes');

  await page.getByRole('button', { name: 'New shared note' }).click();
  await page.getByLabel('Title').fill('Le pont est piégé');
  await page.getByLabel('Text').fill('https://example.com/' + 'pont-de-pierre-'.repeat(20));
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Le pont est piégé' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('tab', { name: 'My notes' }).click();
  await page.getByRole('button', { name: 'New personal note' }).click();
  await page.getByLabel('Text').fill('Ma piste secrète');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Ma piste secrète')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('read a published recap and comment it', async ({ page }) => {
  const comments: Record<string, unknown>[] = [];
  await stubBackend(page, {
    signedIn: true,
    role: 'player',
    rest: {
      sessions: {
        id: 's1',
        slug: 'session-1',
        campaign_id: CAMPAIGN_ID,
        session_number: 1,
        name: 'La descente',
        date: '2026-01-10',
        summary: 'Le groupe est entré dans la mine.',
      },
      session_comments: (request) => {
        if (request.method() === 'POST') {
          comments.push({
            id: `c${comments.length + 1}`,
            campaign_id: CAMPAIGN_ID,
            session_id: 's1',
            author_id: 'e2e-user',
            created_at: '2026-01-11T00:00:00Z',
            updated_at: '2026-01-11T00:00:00Z',
            ...request.postDataJSON(),
          });
          return [];
        }
        return comments;
      },
    },
  });
  await page.goto('/campaign/la-mine-perdue/recaps/session-1');
  await expect(page.getByRole('heading', { name: /Session 1/ })).toBeVisible();
  await expect(page.getByText('Le groupe est entré dans la mine.')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByLabel('Add a comment').fill('Quelle séance ! ' + 'x'.repeat(200));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Quelle séance/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

for (const path of ['/players', '/export', '/campaign/la-mine-perdue/notes', '/campaign/la-mine-perdue/sessions']) {
  test(`a player who types ${path} gets a clear refusal and nothing of the DM is requested`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await stubBackend(page, { signedIn: true, role: 'player' });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This page is reserved for the DM' }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoHorizontalScroll(page);
    const forbidden = requests.filter((u) =>
      /\/admin-api\/|\/rest\/v1\/(notes|encounters|session_dm|campaign_dm)\b/.test(u)
    );
    expect(forbidden).toEqual([]);
  });
}

test('a new device starts in French, and the language chosen on the sign-in page survives a reload', async ({
  page,
}) => {
  await stubBackend(page, { signedIn: false, language: null });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
  await page.getByLabel('Langue').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

// Story 9.7: the 2014 builder. A 2014 draft is opened on its scores step: the four methods (manual entry included) and
// the equipment step with the SRD choices fit 360 px, in English and in French.
for (const language of ['en', 'fr'] as const) {
  test(`2014 builder: scores typed by hand and starting equipment · ${language}`, async ({ page }) => {
    const draft = {
      id: 'c0000000-0000-4000-8000-000000000001',
      slug: 'brenn-2014',
      previous_slugs: [],
      campaign_id: CAMPAIGN_ID,
      name: 'Brenn Forgepierre',
      player_name: 'Alice',
      character_type: 'pc',
      species: 'dwarf',
      class: 'cleric',
      subclass: null,
      level: 1,
      background: 'acolyte',
      alignment: 'lg',
      status: 'draft',
      owner_user_id: 'e2e-user',
      is_active: true,
      heroic_inspiration: false,
      exhaustion_level: 0,
      conditions: [],
      character_private: { backstory: null, notes: null },
    };
    const rows = [
      {
        character_id: draft.id,
        sequence: 0,
        base_abilities: { str: 14, dex: 10, con: 15, int: 8, wis: 16, cha: 12 },
        ability_method: 'manual',
        choices: { 'lineage-choice:species:dwarf:0': { type: 'lineage-choice', lineageId: 'hill-dwarf' } },
        class_id: null,
        class_level: null,
        subclass_id: null,
        asi_allocation: null,
        feat_id: null,
        hp_roll: null,
        deleted_at: null,
      },
      {
        character_id: draft.id,
        sequence: 1,
        base_abilities: null,
        ability_method: null,
        choices: {},
        class_id: 'cleric',
        class_level: 1,
        subclass_id: null,
        asi_allocation: null,
        feat_id: null,
        hp_roll: null,
        deleted_at: null,
      },
    ];
    const wantsObject = (r: import('@playwright/test').Request) =>
      (r.headers()['accept'] ?? '').includes('application/vnd.pgrst.object');
    await stubBackend(page, {
      signedIn: true,
      role: 'player',
      language,
      campaign: { ruleset: '2014', allowed_source_books: ['phb-2014'] },
      rest: {
        characters: (r) => (wantsObject(r) ? draft : [draft]),
        character_build_levels: rows,
        character_private: [{ character_id: draft.id, backstory: null, notes: null }],
      },
    });
    await page.goto('/campaign/la-mine-perdue/character/brenn-2014/edit');
    await expect(page.getByLabel(language === 'en' ? 'Character Name' : /Nom du personnage/)).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Step 3 of the 2014 order is the ability scores, before the background.
    await page.getByRole('button', { name: '3', exact: true }).click();
    const manual = page.getByRole('tab', { name: language === 'en' ? 'Manual entry' : 'Saisie manuelle' });
    await expect(manual).toBeVisible();
    await manual.click();
    await expect(page.getByRole('spinbutton')).toHaveCount(6);
    await expectNoHorizontalScroll(page);

    // An out-of-bounds score is reported where it is typed.
    const first = page.getByRole('spinbutton').first();
    await first.fill('25');
    await first.blur();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await first.fill('17');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Step 5 of the 2014 order is the details, step 6 the equipment with the class choices of the SRD.
    await page.getByRole('button', { name: '6', exact: true }).click();
    await expect(page.getByRole('radio').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
