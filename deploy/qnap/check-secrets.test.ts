import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module without types
import { DEMO_JWT_SECRETS, findProblems, parseEnv } from './check-secrets.mjs';

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function jwt(role: string, secret: string, iss = 'supabase') {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss, role, exp: 4102444800 }));
  const signature = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

const SECRET = 'k3J9xQ7vLp2ZrT8mWc5YbN1dFg6HsA4uEo0iXyVtRq3PzKnMjCwUbLaGhDe7SfOi';

function goodEnv(): Record<string, string> {
  return {
    PUBLIC_URL: 'https://dnd.example.test',
    JWT_SECRET: SECRET,
    POSTGRES_PASSWORD: 'q7Zk2mXp9Lr4Tn8Wc3Yb6Hd1Fg5Js0Av',
    ANON_KEY: jwt('anon', SECRET),
    SERVICE_ROLE_KEY: jwt('service_role', SECRET),
  };
}

describe('check-secrets', () => {
  it('accepts a generated-looking file', () => {
    expect(findProblems(goodEnv())).toEqual([]);
  });

  it('parses an env file, ignoring comments and blank lines', () => {
    expect(parseEnv('# c\n\nA=1\nB=x=y\n')).toEqual({ A: '1', B: 'x=y' });
  });

  it('reports every missing variable', () => {
    expect(findProblems({})).toHaveLength(5);
  });

  it('refuses a demonstration JWT secret', () => {
    const env = { ...goodEnv(), JWT_SECRET: DEMO_JWT_SECRETS[0] };
    expect(findProblems(env).join('\n')).toContain('JWT_SECRET: demonstration value');
  });

  it('refuses keys signed with a demonstration secret, even with a strong JWT_SECRET', () => {
    const env = { ...goodEnv(), ANON_KEY: jwt('anon', DEMO_JWT_SECRETS[0]) };
    expect(findProblems(env).join('\n')).toContain('ANON_KEY: signed with a demonstration secret');
  });

  it('refuses the demo issuer', () => {
    const env = { ...goodEnv(), ANON_KEY: jwt('anon', SECRET, 'supabase-demo') };
    expect(findProblems(env).join('\n')).toContain('supabase-demo');
  });

  it('refuses keys that do not match JWT_SECRET', () => {
    const env = { ...goodEnv(), SERVICE_ROLE_KEY: jwt('service_role', 'c'.repeat(64)) };
    expect(findProblems(env).join('\n')).toContain('SERVICE_ROLE_KEY: not signed with JWT_SECRET');
  });

  it('refuses swapped roles', () => {
    const env = { ...goodEnv(), ANON_KEY: jwt('service_role', SECRET) };
    expect(findProblems(env).join('\n')).toContain('ANON_KEY: role is "service_role"');
  });

  it('refuses weak or demonstration database passwords', () => {
    expect(findProblems({ ...goodEnv(), POSTGRES_PASSWORD: 'postgres' }).join('\n')).toContain('POSTGRES_PASSWORD');
    expect(findProblems({ ...goodEnv(), POSTGRES_PASSWORD: 'short' }).join('\n')).toContain('shorter than 24');
    expect(findProblems({ ...goodEnv(), POSTGRES_PASSWORD: `${'b'.repeat(30)}@/` }).join('\n')).toContain(
      'only letters'
    );
  });

  it('refuses repetitive values', () => {
    expect(findProblems({ ...goodEnv(), POSTGRES_PASSWORD: 'b'.repeat(32) }).join('\n')).toContain('too repetitive');
    const weak = 'a'.repeat(64);
    expect(findProblems({ ...goodEnv(), JWT_SECRET: weak }).join('\n')).toContain('JWT_SECRET: too repetitive');
  });

  it('refuses plain http outside localhost', () => {
    expect(findProblems({ ...goodEnv(), PUBLIC_URL: 'http://dnd.example.test' }).join('\n')).toContain('PUBLIC_URL');
    expect(findProblems({ ...goodEnv(), PUBLIC_URL: 'http://localhost:8080' })).toEqual([]);
  });
});
