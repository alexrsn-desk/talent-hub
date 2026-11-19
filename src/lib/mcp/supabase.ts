import { createClient } from '@supabase/supabase-js';
import type { ToolContext } from '@lovable.dev/mcp-js';
type RuntimeGlobals = typeof globalThis & { Deno?: { env?: { get?: (name: string) => string | undefined } }; process?: { env?: Record<string, string | undefined> } };
function env(name: string) { const runtime = globalThis as RuntimeGlobals; return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name]; }
function key() {
  const direct = env('SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (direct) return direct;
  try { const values: unknown = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'); if (values && typeof values === 'object') { const found = Object.values(values).find((v): v is string => typeof v === 'string' && v.startsWith('sb_publishable_')); if (found) return found; } } catch { /* Try legacy key. */ }
  const legacy = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY');
  if (!legacy) throw new Error('Public backend key is missing');
  return legacy;
}
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!ctx.isAuthenticated() || !token || !ctx.getUserId()) throw new Error('Sign in required');
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
  if (!url) throw new Error('Backend URL is missing');
  return createClient(url, key(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}
export function result(data: unknown, error?: { message: string } | null) { return error ? { content: [{ type: 'text' as const, text: error.message }], isError: true } : { content: [{ type: 'text' as const, text: JSON.stringify(data ?? []) }] }; }
export async function requireRecord(client: ReturnType<typeof supabaseForUser>, table: string, id: string) {
  const { data, error } = await client.from(table).select('id').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Record not found or not accessible');
}
