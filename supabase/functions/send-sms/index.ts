import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const schema = z.object({
  candidate_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  to: z.string().min(6).max(30),
  body: z.string().trim().min(1).max(1600),
}).refine((v) => v.candidate_id || v.client_id, { message: 'Recipient required' });

function toE164(raw: string): string | null {
  let s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('07') && s.length === 11) s = '+44' + s.slice(1);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const sb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'Sign in required' }, 401);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Check the recipient and message' }, 400);
    const p = parsed.data;

    if (p.candidate_id) {
      const { data: c } = await sb.from('candidates').select('id,do_not_contact,gdpr_deleted,status').eq('id', p.candidate_id).maybeSingle();
      if (!c) return json({ error: 'Candidate not found' }, 404);
      if (c.do_not_contact || c.gdpr_deleted || c.status === 'Do Not Contact') return json({ error: 'This person is marked Do Not Contact' }, 403);
    } else if (p.client_id) {
      const { data: c } = await sb.from('clients').select('id').eq('id', p.client_id).maybeSingle();
      if (!c) return json({ error: 'Client not found' }, 404);
    }

    const to = toE164(p.to);
    if (!to) return json({ error: 'Phone number is not valid' }, 400);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    const FROM = Deno.env.get('TWILIO_FROM_NUMBER');
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !FROM) return json({ error: 'Text messaging is not set up yet — connect Twilio first', code: 'not_configured' }, 400);

    const res = await fetch('https://connector-gateway.lovable.dev/twilio/Messages.json', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': TWILIO_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: FROM, Body: p.body }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Twilio send failed [${res.status}]: ${text}`);
      let msg = 'Text could not be sent';
      try { msg = JSON.parse(text).message || msg; } catch { /* keep */ }
      return json({ error: msg, status: res.status }, res.status >= 500 ? 502 : 400);
    }
    const sid = JSON.parse(text).sid as string | undefined;
    const { data: row } = await sb.from('conversation_messages').insert({
      owner_user_id: user.id, candidate_id: p.candidate_id ?? null, client_id: p.client_id ?? null, contact_id: p.contact_id ?? null,
      channel: 'sms', direction: 'outbound', from_address: FROM, to_address: to, body: p.body, status: 'sent', provider_message_id: sid ?? null,
    }).select('*').single();
    await sb.from('notes').insert({ candidate_id: p.candidate_id ?? null, client_id: p.client_id ?? null, owner_user_id: user.id, activity_type: 'Text Message', content: `Text sent\n\n${p.body}` });
    return json({ sent: true, message: row });
  } catch (e) {
    console.error(e);
    return json({ error: 'Delivery could not be confirmed. Check before resending.' }, 500);
  }
});
