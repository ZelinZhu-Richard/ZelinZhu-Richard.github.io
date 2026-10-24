// remind: called by pg_cron at both UTC hours of each reminder slot (the cron migration). Sends at most one
// email per slot per day, only when the slot is due in New York, the owner has that reminder on (Settings),
// and there is something to say. Email needs the RESEND_API_KEY, REMIND_EMAIL_TO and REMIND_EMAIL_FROM
// function secrets; without them the slot is logged as not sent. Reminders stop at 21:30 (PLAN.md section 14).

import { fail, json } from '../_shared/cors.ts';
import { admin, checkCron, engine, loadGame } from '../_shared/game.ts';
import { REMINDER_SLOTS, REMINDER_TOLERANCE_MIN, REMINDERS_STOP } from '../_shared/config.ts';

const PAGE = 'https://zelinzhu-richard.github.io/daily/';

type Slot = (typeof REMINDER_SLOTS)[number];

/** The reminder for this slot, or '' when there is nothing to say (same wording as app/daily.js). */
export function reminderText(state: any, now: number, slot: Slot): string {
  const today = engine.viewToday(state, now);
  const header = engine.viewHeader(state, now);
  if (!today) return '';
  if (slot.kind === 'evening') {
    const left = (today.tasks || []).filter((t: { ticked: boolean }) => !t.ticked);
    if (!left.length || header.window?.phase !== 'open') return '';
    const pets = engine.viewPets(state, now).active.filter((p: { mood: string }) => p.mood !== 'dead');
    const pet = pets.find((p: { id: string }) => p.id === state.settings?.companionId)?.name || pets[0]?.name || 'Your pets';
    return `${pet} is waiting on ${left.length === 1 ? 'one task' : `${left.length} tasks`}: ${left.map((t: { name: string }) => t.name).join(', ')}.`;
  }
  if ((today.progress?.done || 0) > 0) return '';
  return `Good morning. ${today.progress?.total || 0} tasks today at ${engine.LEVEL_LABELS[today.level] ?? today.level}.`;
}

async function sendEmail(text: string): Promise<{ channel: string; ok: boolean; detail: string }> {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('REMIND_EMAIL_TO');
  const from = Deno.env.get('REMIND_EMAIL_FROM');
  if (!key || !to || !from) return { channel: 'none', ok: false, detail: 'email not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Daily', text: `${text}\n\n${PAGE}` }),
  });
  return { channel: 'email', ok: res.ok, detail: res.ok ? 'sent' : `resend ${res.status}` };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(req, 405, 'method', 'Use POST.');
  if (!checkCron(req)) return fail(req, 401, 'unauthorised', 'Missing or wrong cron secret.');

  const db = admin();
  try {
    const now = Date.now();
    const minute = engine.time.minuteOfDay(now);
    const slot = REMINDER_SLOTS.find((s) => Math.abs(minute - s.at) <= REMINDER_TOLERANCE_MIN);
    if (!slot || minute >= REMINDERS_STOP) return json(req, 200, { ok: true, due: null }); // e.g. the other UTC hour of a slot (DST)

    const game = await loadGame(db);
    if (!game) return json(req, 200, { ok: true, due: slot.id, sent: false, reason: 'no game' });
    const { state } = engine.advance(game.state, now); // a view only; day-close saves the real advance
    const on = state.settings?.reminders || {};
    if (!on[slot.kind]) return json(req, 200, { ok: true, due: slot.id, sent: false, reason: 'off in settings' });
    const text = reminderText(state, now, slot);
    if (!text) return json(req, 200, { ok: true, due: slot.id, sent: false, reason: 'nothing to remind' });

    // Claim the slot first, so a retried or doubled cron run can't send twice.
    const dayKey = engine.time.dayKey(now);
    const claim = await db.from('reminder_log').insert({ day_key: dayKey, slot: slot.id, channel: 'pending', ok: false });
    if (claim.error) return json(req, 200, { ok: true, due: slot.id, sent: false, reason: 'already handled' });

    const result = await sendEmail(text);
    await db.from('reminder_log').update(result).eq('day_key', dayKey).eq('slot', slot.id);
    return json(req, 200, { ok: true, due: slot.id, sent: result.ok, reason: result.detail });
  } catch (err) {
    console.error('remind', err);
    return fail(req, 500, 'server', 'remind failed.');
  }
});
