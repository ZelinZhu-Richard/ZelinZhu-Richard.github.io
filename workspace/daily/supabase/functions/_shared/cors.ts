// The one CORS helper for every browser-called function (PLAN.md section 1 "Later: Supabase").
// Production allows exactly the site origin. ALLOWED_ORIGINS (an optional, comma-separated function secret)
// adds local origins such as http://127.0.0.1:5173 for `npm run dev`; it is set in config.toml locally only.

export const SITE_ORIGIN = 'https://zelinzhu-richard.github.io';

// Every header supabase-js sends (kept in step with @supabase/supabase-js/cors).
const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage';

export function allowedOrigins(): Set<string> {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([SITE_ORIGIN, ...extra]);
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '86400',
  };
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins().has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/** Answers a CORS preflight, or returns null for any other request. */
export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  const origin = req.headers.get('Origin');
  const ok = !origin || allowedOrigins().has(origin);
  return new Response(null, { status: ok ? 204 : 403, headers: corsHeaders(req) });
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function fail(req: Request, status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json(req, status, { error: { code, message }, ...extra });
}
