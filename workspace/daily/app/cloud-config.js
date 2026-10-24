// Supabase project settings for Daily and HQ (workspace/daily/SETUP.md, "Paste the URL and key").
// Both values are public by design: Row Level Security and the Edge Functions protect the data.
// Leave them empty to keep the local-first mode (the game and HQ live in this browser only).
// Never paste a secret key (sb_secret_…) or the service_role key here; the build refuses them.
export const CLOUD = Object.freeze({
  url: '', // https://<project-ref>.supabase.co
  anonKey: '', // the publishable key (sb_publishable_…) or the legacy anon key
});

// Local development only: on localhost, a JSON { url, anonKey } saved under this localStorage key points the
// page at a local stack (`supabase start --workdir workspace/daily`) without editing the committed config.
export const DEV_OVERRIDE_KEY = 'daily:cloud';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/;

/** The settings in effect: the committed CLOUD, or the dev override on a local host. */
export function cloudConfig({ location = globalThis.location, storage = globalThis.localStorage, base = CLOUD } = {}) {
  if (LOCAL_HOST.test(location?.hostname || '')) {
    try {
      const o = JSON.parse(storage?.getItem(DEV_OVERRIDE_KEY) || 'null');
      if (o && typeof o.url === 'string' && typeof o.anonKey === 'string') return { url: o.url.replace(/\/+$/, ''), anonKey: o.anonKey };
    } catch { /* no override */ }
  }
  return base;
}

export const cloudEnabled = (cloud) => Boolean(cloud?.url && cloud?.anonKey);
