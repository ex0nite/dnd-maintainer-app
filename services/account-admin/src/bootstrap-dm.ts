// Bootstrap the single DM account (AD-15). Run by the owner, from the server, once.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ACCOUNT_DOMAIN=... \
//     npx tsx services/account-admin/src/bootstrap-dm.ts <pseudo>
//
// The password is typed in the terminal (hidden), never passed as an argument
// or stored. No secret lives in the repository.

import { createClient } from '@supabase/supabase-js';
import { AccountError, createAccount } from './accounts.ts';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Missing environment variable ${name}\n`);
    process.exit(2);
  }
  return value;
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('A terminal is required to type the password'));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const pseudo = process.argv[2];
  if (!pseudo) {
    process.stderr.write('Usage: bootstrap-dm.ts <pseudo>\n');
    process.exit(2);
  }
  const url = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const domain = process.env.ACCOUNT_DOMAIN ?? 'table';

  const password = await readHidden('Password: ');
  const confirmation = await readHidden('Confirm password: ');
  if (password !== confirmation) {
    process.stderr.write('Passwords differ\n');
    process.exit(2);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const { userId, email } = await createAccount(admin, {
      pseudo,
      password,
      role: 'dm',
      domain,
      mustChangePassword: false,
    });
    process.stdout.write(`DM account created: ${userId} (${email})\n`);
  } catch (e) {
    if (e instanceof AccountError) {
      process.stderr.write(`Refused (${e.code}): ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }
}

await main();
