// Server-only settings. Game numbers live in engine/config.js (shared with the browser); these are the few
// values that exist only on the server. Secrets are never here: they are function secrets (SETUP.md).

/** Model for generate-variants. Override per deployment with the VARIANTS_MODEL function secret. */
export const VARIANTS_MODEL = Deno.env.get('VARIANTS_MODEL') || 'claude-opus-5-5';

/**
 * Reminder slots, New York time, as minutes after midnight. Same slots as the in-page reminders
 * (app/daily.js reminderText / maybeNotify); the cron migration fires remind at both UTC hours of each.
 */
export const REMINDER_SLOTS = [
  { id: '0730', at: 7 * 60 + 30, kind: 'morning' },
  { id: '1900', at: 19 * 60, kind: 'evening' },
  { id: '2115', at: 21 * 60 + 15, kind: 'evening' },
] as const;

/** No reminder at or after 21:30 New York: sleep is protected (PLAN.md section 14). */
export const REMINDERS_STOP = 21 * 60 + 30;

/** A cron run counts for a slot when it lands within this many minutes of it (pg_net and cold starts lag). */
export const REMINDER_TOLERANCE_MIN = 20;

/** At most this many RNG draws are written into one game_events row (the counter range is always kept). */
export const MAX_LOGGED_DRAWS = 512;
