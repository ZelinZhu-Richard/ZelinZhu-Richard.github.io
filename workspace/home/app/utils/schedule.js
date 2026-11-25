// The story schedule the page lays out against (see ./sections.js for the rule).
// engine/timeline/schedule.js is pure (no three), so importing it here costs a few hundred
// bytes. It is picked up with import.meta.glob, which yields {} while the file does not
// exist yet, so the app builds and runs on the fallback table until the engine lands.
import { buildSchedule } from './sections.js';

const found = import.meta.glob('../../engine/timeline/schedule.js', { eager: true });

/** @type {import('./sections.js').Schedule} */
export const schedule = buildSchedule(/** @type {Record<string, any> | null} */ (Object.values(found)[0] || null));
