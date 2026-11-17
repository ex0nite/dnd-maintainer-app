import { z } from 'zod';

// zod probes `new Function('')` to decide whether it may compile fast validators. Under our Content-Security-Policy
// (no `unsafe-eval`, AD-21) that probe is refused and reported as a violation on every page load. `jitless` makes
// zod skip the probe and use its interpreted validators, which are plenty fast for the few forms of this app.
z.config({ jitless: true });
