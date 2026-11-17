# Spike: what the installed authentication really does (story 2.1)

Run on the local stack of this repository: GoTrue `v2.197.0` (Supabase CLI 2.122.1), `minimum_password_length = 12`,
`[auth] enable_signup = false`, `[auth.email] enable_signup = true`. Script: `services/account-admin/spike/auth-spike.mjs`
(local throw-away stack only; it refuses any other host). It creates and deletes its own users.

To replay it, start an isolated stack with the hook configured (the throw-away function is created by the script itself):

```toml
[auth.hook.password_verification_attempt]
enabled = true
uri = "pg-functions://postgres/public/spike_pw_hook"
```

```bash
SPIKE_API_URL=http://127.0.0.1:<port> SPIKE_ANON_KEY=... SPIKE_SERVICE_KEY=... \
SPIKE_DB_CONTAINER=supabase_db_<project> node services/account-admin/spike/auth-spike.mjs
```

## Findings

| # | Question | Result | Consequence |
|---|---|---|---|
| 1 | `.invalid` addresses | Accepted by the admin API **and** by password login. | AD-2 holds. |
| 2 | Confirmed user without mail | `POST /auth/v1/admin/users` with `email_confirm: true` returns a confirmed user that can log in at once. | AD-2 holds. |
| 3 | `auth.sessions` | Exists. Deleting a user's rows makes the **access token fail at once (403)** and the refresh token fail (400). | Session revocation (stories 2.4, 2.5) = `delete from auth.sessions where user_id = …`, effective immediately, not at token expiry. |
| 4 | Admin password change | `PUT /auth/v1/admin/users/:id {password}` works; the old password then fails (400). **Existing sessions stay valid**: revocation is a separate, explicit step. | Story 2.4: change password, set `must_change_password`, then delete the sessions, in that order. |
| 5 | User changes own address | **Not disabled**: `PUT /auth/v1/user {email}` answers 200 and writes `auth.users.email_change` (confirmation mail needed to finish, `double_confirm_changes = true`). There is no configuration switch to forbid it. | Contradicts the assumption "disabled by configuration" of AD-11. Mitigation tested: a `BEFORE UPDATE` trigger on `auth.users` refusing any change of `email` or `email_change` (42501). GoTrue answers 500 and nothing is written; admin password changes still work. The trigger goes into story 2.3's migration (it already adds a trigger on `auth.users`). No SMTP is configured in production, which is a second barrier. |
| 6 | Password verification hook | **Available**: `[auth.hook.password_verification_attempt]` is accepted by the CLI and called by GoTrue with `user_id` and `valid`. A `reject` decision refuses even a correct password (HTTP 400, `invalid_credentials`, the hook's message is returned). Per-pseudo: another pseudo is not affected. The hook is **not called for an unknown pseudo**, so there is no counter for it (nothing to lock, nothing to enumerate through the lock). A configured hook whose function does not exist makes **every** login fail with 500 (fails closed). | FR-2 stands: story 2.6 implements the per-pseudo lock with this hook. The hook's `message` must be the same generic text as a wrong password (a distinct message would reveal the lock). The migration creating the function must precede the configuration change on the QNAP. |
| 7 | Free signup with the public key | `POST /auth/v1/signup` and `POST /auth/v1/otp {create_user: true}` both answer 422 `signup_disabled`; no user row created. | AD-2 / AD-11 hold. |

Also observed: a user can change their own password with `PUT /auth/v1/user {password}` (200) with no re-authentication
(`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false`). Story 2.3 relies on it (the player chooses their
own password); a `secure_password_change` setting would demand a recent login or a nonce and must stay off.

## Decision for the owner

No result contradicts the PRD: FR-2 (per-pseudo lock) is feasible, so no PRD amendment. Only AD-11 changes: the
sign-in address cannot be locked by configuration, it is locked by a trigger (finding 5). Nothing to approve beyond
reading this; the trigger is part of story 2.3.
