// account-admin: the only server component of the app (AD-2). Started by the owner on the QNAP,
// reachable only through the proxy at /admin-api/.
//
// Environment (no secret in the repository, none in the bundle, none in the logs):
//   SUPABASE_URL                 internal URL of the authentication/API gateway (e.g. http://kong:8000)
//   SUPABASE_PUBLISHABLE_KEY     publishable (anon) key: only sent to GET /auth/v1/user
//   SUPABASE_SERVICE_ROLE_KEY    administration key: used here and nowhere else
//   ACCOUNT_DOMAIN               label of the derived sign-in address (default `table`)
//   PORT / HOST                  default 8787 / 127.0.0.1
//   TRUSTED_IP_HEADER            header the proxy OVERWRITES with the real client address (e.g. x-real-ip);
//                                unset = the socket address is used

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createHandler } from './handlers.ts';

const MAX_BODY_BYTES = 2048;

class StatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Missing environment variable ${name}\n`);
    process.exit(2);
  }
  return value;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET') {
      resolve(undefined);
      return;
    }
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') {
      reject(new StatusError(415, 'unsupported_media_type'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new StatusError(413, 'payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new StatusError(400, 'invalid_body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // The creation answer carries a temporary password: nothing may cache it.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function main(): void {
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const publishableKey = requireEnv('SUPABASE_PUBLISHABLE_KEY');
  const domain = process.env.ACCOUNT_DOMAIN ?? 'table';
  const trustedIpHeader = process.env.TRUSTED_IP_HEADER?.toLowerCase();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '127.0.0.1';

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const handle = createHandler({ admin, supabaseUrl, publishableKey, domain });

  const server = createServer((req, res) => {
    void (async () => {
      const started = Date.now();
      const path = (req.url ?? '').split('?')[0];
      let status = 500;
      try {
        const headerIp = trustedIpHeader ? req.headers[trustedIpHeader] : undefined;
        const ip = (Array.isArray(headerIp) ? headerIp[0] : headerIp) ?? req.socket.remoteAddress ?? 'unknown';
        const body = await readBody(req);
        const result = await handle({
          method: req.method ?? 'GET',
          path,
          authorization: req.headers.authorization,
          ip,
          body,
        });
        status = result.status;
        send(res, status, result.body);
      } catch (e) {
        if (e instanceof StatusError) {
          status = e.status;
          send(res, status, { error: e.message });
        } else {
          // Cause only (never headers, bodies, tokens, keys): the caller gets a generic answer.
          process.stderr.write(`error: ${(e as Error).message}\n`);
          send(res, 500, { error: 'internal_error' });
        }
      } finally {
        process.stdout.write(`${JSON.stringify({ method: req.method, path, status, ms: Date.now() - started })}\n`);
      }
    })();
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.listen(port, host, () => process.stdout.write(`account-admin listening on ${host}:${port}\n`));
}

main();
