import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerFieldsForNewCharacter } from './ownership';

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

function clientWith(profile?: { role: 'dm' | 'player' }) {
  const client = new QueryClient();
  if (profile) client.setQueryData(['profile', 'u-1'], profile);
  return client;
}

beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } });
});

describe('ownerFieldsForNewCharacter', () => {
  it("makes a player's new character theirs and a PC", async () => {
    await expect(ownerFieldsForNewCharacter(clientWith({ role: 'player' }))).resolves.toEqual({
      owner_user_id: 'u-1',
      character_type: 'pc',
    });
  });

  it("leaves the DM's new character unassigned", async () => {
    await expect(ownerFieldsForNewCharacter(clientWith({ role: 'dm' }))).resolves.toEqual({});
  });

  it('adds nothing when the role is not known yet, or nobody is signed in, or the session cannot be read', async () => {
    await expect(ownerFieldsForNewCharacter(clientWith())).resolves.toEqual({});
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(ownerFieldsForNewCharacter(clientWith({ role: 'player' }))).resolves.toEqual({});
    auth.getSession.mockRejectedValue(new Error('offline'));
    await expect(ownerFieldsForNewCharacter(clientWith({ role: 'player' }))).resolves.toEqual({});
  });
});
