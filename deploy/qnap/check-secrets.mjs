// Fails when the stack's env file still holds a demonstration value (story 7.2, NFR5b).
//
//   node deploy/qnap/check-secrets.mjs <env-file>
//
// It never prints a secret, only the name of the variable and the reason.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Well-known values shipped with Supabase (docs, docker/.env.example, `supabase start`). */
export const DEMO_JWT_SECRETS = [
  'super-secret-jwt-token-with-at-least-32-characters-long',
  'your-super-secret-jwt-token-with-at-least-32-characters-long',
];
export const DEMO_DB_PASSWORDS = ['postgres', 'your-super-secret-and-long-postgres-password', 'password'];

const REQUIRED = ['PUBLIC_URL', 'JWT_SECRET', 'POSTGRES_PASSWORD', 'ANON_KEY', 'SERVICE_ROLE_KEY'];

/** Distinct characters: catches 'aaaa...' and other patterns that no generator would produce. */
const distinct = (value) => new Set(value).size;

export function parseEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function signatureMatches(token, secret) {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return false;
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** @returns {string[]} one message per problem, empty when the file is clean */
export function findProblems(env) {
  const problems = [];

  for (const name of REQUIRED) {
    if (!env[name]) problems.push(`${name}: missing or empty`);
  }
  if (problems.length > 0) return problems;

  if (DEMO_JWT_SECRETS.includes(env.JWT_SECRET)) problems.push('JWT_SECRET: demonstration value');
  if (env.JWT_SECRET.length < 48) problems.push('JWT_SECRET: shorter than 48 characters');
  if (distinct(env.JWT_SECRET) < 12) problems.push('JWT_SECRET: too repetitive to be random');
  if (DEMO_DB_PASSWORDS.includes(env.POSTGRES_PASSWORD)) problems.push('POSTGRES_PASSWORD: demonstration value');
  if (env.POSTGRES_PASSWORD.length < 24) problems.push('POSTGRES_PASSWORD: shorter than 24 characters');
  if (distinct(env.POSTGRES_PASSWORD) < 10) problems.push('POSTGRES_PASSWORD: too repetitive to be random');
  if (/[^A-Za-z0-9_-]/.test(env.POSTGRES_PASSWORD)) {
    problems.push('POSTGRES_PASSWORD: only letters, digits, - and _ (it is embedded in connection URLs)');
  }
  if (env.ANON_KEY === env.SERVICE_ROLE_KEY) problems.push('ANON_KEY: same as SERVICE_ROLE_KEY');
  if (!env.PUBLIC_URL.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.PUBLIC_URL)) {
    problems.push('PUBLIC_URL: must be https (http is accepted only for localhost)');
  }

  for (const [name, role] of [
    ['ANON_KEY', 'anon'],
    ['SERVICE_ROLE_KEY', 'service_role'],
  ]) {
    const token = env[name];
    const [header, payload] = token.split('.');
    const claims = payload ? decodePart(payload) : null;
    if (!header || !claims) {
      problems.push(`${name}: not a JWT`);
      continue;
    }
    if (claims.iss === 'supabase-demo') problems.push(`${name}: demonstration key (iss supabase-demo)`);
    if (claims.role !== role) problems.push(`${name}: role is "${claims.role}", expected "${role}"`);
    if (DEMO_JWT_SECRETS.some((secret) => signatureMatches(token, secret))) {
      problems.push(`${name}: signed with a demonstration secret`);
    } else if (!signatureMatches(token, env.JWT_SECRET)) {
      problems.push(`${name}: not signed with JWT_SECRET (regenerate the keys)`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('Usage: node deploy/qnap/check-secrets.mjs <env-file>\n');
    process.exit(2);
  }
  const env = parseEnv(readFileSync(file, 'utf8'));
  const problems = findProblems(env);
  // Docker Compose lets a variable exported in the shell win over --env-file: the file could pass while another value runs.
  for (const name of [...REQUIRED, 'JWT_EXPIRY', 'CSP_HEADER_NAME']) {
    if (process.env[name] !== undefined && process.env[name] !== env[name]) {
      problems.push(`${name}: also set in the shell with another value (compose would use the shell's)`);
    }
  }
  if (problems.length > 0) {
    process.stderr.write(`Refused: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('OK: no demonstration value, keys consistent with JWT_SECRET\n');
}
