# QNAP load test (story 7.1, NFR4, SM-4, D-20)

Question: does the lightweight Supabase stack fit on the QNAP next to what already runs there (nginx-proxy-manager and
others), with 5 players? Threshold: at least **500 MB of available memory** at all times and the other services still
healthy.

This report holds no host name and no address (public repository).

## Setup

- Machine: x86_64, 4 cores (Celeron class), about 3.8 GB of RAM in total, swap present. Docker 27 and Compose v2 from
  Container Station.
- Stack: `deploy/qnap/docker-compose.yml` (db, auth, rest, storage, gateway; Studio, realtime, pg-meta, analytics, vector
  and edge functions are not started), each container memory-capped. Isolated compose project, own volumes, own network,
  port bound to loopback: **nothing was exposed**, and the existing containers were not touched.
- Load: `deploy/qnap/loadtest.mjs` in a `node:22-alpine` container on the stack's network. One DM and 5 players sign in,
  then loop for 30 minutes with 1 to 4 s of think time: read profile, characters, recaps, comments, notes; create and edit
  a personal note; post a comment; once a minute upload a 200 KB portrait, sign it and delete it. The DM reads campaigns,
  characters and sessions. This is far busier than a real table.
- Memory read from `/proc/meminfo` (`MemAvailable`) every 25 to 30 s, plus per-container figures.

## Results

| Run                                      | Requests | Errors | Min available  | Mean available | Max swap used | Max load (1 min) |
| ---------------------------------------- | -------- | ------ | -------------- | -------------- | ------------- | ---------------- |
| Baseline, nothing of ours running        | -        | -      | about 1 680 MB | -              | -             | -                |
| 1. Stack without `account-admin`, 30 min | 8 252    | 116 \* | 1 270 MB       | 1 283 MB       | 629 MB        | 2.5              |
| 2. Stack with `account-admin`, 30 min    | 8 598    | 0      | 1 251 MB       | 1 271 MB       | 652 MB        | 3.6              |

\* All 116 errors are portrait uploads refused by the database: the loader of run 1 did not delete its uploads and hit
the designed limit of 5 objects per character (migration 3.8). The loader now replaces instead of accumulating; run 2 has
no error. (This also shows the quota holds under concurrency.)

Container memory under load (typical): database 105 to 110 MB, storage 75 to 100 MB, rest 35 MB, auth 18 MB, gateway 4 MB,
**account-admin 26 MB** (cap 96 MB). The load generator itself used 25 to 75 MB and is included in the figures above.

Latency through the gateway (server side, 5 players): reads 6 to 22 ms median (95th percentile under 40 ms), writes 19 to
25 ms median, portrait upload 33 to 70 ms median. Password sign-in 0.8 to 0.9 s (the password hash is deliberately slow on
this CPU); creating a player account through `account-admin` 0.7 s.

`nginx-proxy-manager` stayed healthy and kept its memory (about 130 to 145 MB) during both runs.

## Conclusion

- The stack costs about **400 MB** of the QNAP's memory under a heavy 5-player load, `account-admin` included (26 MB).
  Available memory never went below **1 250 MB**, 2.5 times the 500 MB threshold.
- **Decision: self-hosting stays** (the cloud fallback of D-20 is not needed). Recorded as D-33.
- Caveats: the figures are for 5 players and for this QNAP at this moment (other services may grow); the test ran while the
  other services were in their usual state and did not add heavy transfers by them. Re-measure if the table grows or other
  services are added.

## Reproduce

`deploy/qnap/loadtest.mjs` (and `deploy/qnap/smoke.mjs` for the access checks) run against any stack of this repository,
locally with `deploy/qnap/localtest.sh up`; CI runs a 40 second version (job `stack`).
