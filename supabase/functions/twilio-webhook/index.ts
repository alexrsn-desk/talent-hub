import { createClient } from 'npm:@supabase/supabase-js@2';

// Receives inbound SMS/WhatsApp from Twilio and files them against the matching candidate or client.
const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
const tail = (s: string) => s.replace(/\D/g, '').slice(-10);
const AUTOMATED = /(out of (the )?office|auto.?reply|automatic reply|^stop$|unsubscribe)/i;
const FYI = /^(thanks|thank you|cheers|ok|okay|great|perfect|got it|👍|ta)[!. ]*$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const form = await req.formData();
    const from = String(form.get('From') ?? '').replace('whatsapp:', '');
    const to = String(form.get('To') ?? '').replace('whatsapp:', '');
    const body = String(form.get('Body') ?? '').slice(0, 5000);
    const sid = String(form.get('MessageSid') ?? '');
    const channel = String(form.get('From') ?? '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
    const ours = Deno.env.get('TWILIO_FROM_NUMBER');
    if (!from || !body || (ours && tail(to) !== tail(ours))) return twiml();

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: dup } = await admin.from('conversation_messages').select('id').eq('provider_message_id', sid).maybeSingle();
    if (dup) return twiml();
    const t = tail(from);
    if (t.length < 9) return twiml();

    let match: Record<string, string | null> | null = null;
    const { data: cands } = await admin.from('candidates').select('id,owner_user_id,agency_id,phone').ilike('phone', `%${t.slice(-6)}%`).limit(20);
    const cm = (cands ?? []).find((c: any) => c.phone && tail(c.phone) === t);
    if (cm) match = { candidate_id: cm.id, owner_user_id: cm.owner_user_id, agency_id: cm.agency_id };
    if (!match) {
      const { data: cts } = await admin.from('contacts').select('id,client_id,owner_user_id,agency_id,phone,mobile_phone,direct_phone')
        .or(`phone.ilike.%${t.slice(-6)}%,mobile_phone.ilike.%${t.slice(-6)}%,direct_phone.ilike.%${t.slice(-6)}%`).limit(20);
      const ct = (cts ?? []).find((c: any) => [c.phone, c.mobile_phone, c.direct_phone].some((p) => p && tail(p) === t));
      if (ct) match = { client_id: ct.client_id, contact_id: ct.id, owner_user_id: ct.owner_user_id, agency_id: ct.agency_id };
    }
    if (!match) {
      const { data: cls } = await admin.from('clients').select('id,owner_user_id,agency_id,phone').ilike('phone', `%${t.slice(-6)}%`).limit(20);
      const cl = (cls ?? []).find((c: any) => c.phone && tail(c.phone) === t);
      if (cl) match = { client_id: cl.id, owner_user_id: cl.owner_user_id, agency_id: cl.agency_id };
    }
    if (!match) return twiml(); // unknown sender — stays out of Conversations

    const needs = !AUTOMATED.test(body) && !FYI.test(body.trim());
    await admin.from('conversation_messages').insert({
      ...match, channel, direction: 'inbound', from_address: from, to_address: to, body, status: AUTOMATED.test(body) ? 'automated' : 'received',
      needs_action: needs, provider_message_id: sid || null,
    });
    await admin.from('notes').insert({ candidate_id: match.candidate_id ?? null, client_id: match.client_id ?? null, owner_user_id: match.owner_user_id, agency_id: match.agency_id, activity_type: channel === 'whatsapp' ? 'WhatsApp' : 'Text Message', content: `Reply received\n\n${body}` });
    return twiml();
  } catch (e) {
    console.error('twilio-webhook', e);
    return twiml();
  }
});
