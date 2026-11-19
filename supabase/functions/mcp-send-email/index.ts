import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { activeMailProvider, sendEmailAsUser } from '../_shared/mailer.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const schema = z.object({ candidate_id: z.string().uuid(), subject: z.string().min(1).max(500).regex(/^[^\r\n]+$/), body: z.string().min(1).max(20000), confirmed: z.literal(true) });
Deno.serve(async req => {
  if(req.method === 'OPTIONS') return new Response(null,{headers});
  try {
    const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_ANON_KEY');
    if(!url || !key) return json({error:'Sending unavailable'},503);
    const sb = createClient(url,key,{global:{headers:{Authorization:req.headers.get('Authorization') ?? ''}}});
    const {data:{user}} = await sb.auth.getUser(); if(!user) return json({error:'Sign in required'},401);
    const parsed = schema.safeParse(await req.json()); if(!parsed.success) return json({error:'Confirm the recipient and exact message before sending'},400);
    const {data:c,error} = await sb.from('candidates').select('id,email,do_not_contact,gdpr_deleted,status').eq('id',parsed.data.candidate_id).single();
    if(error || !c) return json({error:'Candidate not found or not accessible'},404);
    if(c.do_not_contact || c.gdpr_deleted || c.status === 'Do Not Contact') return json({error:'This person cannot be contacted'},403);
    if(!c.email || !z.string().email().safeParse(c.email).success) return json({error:'Candidate needs a valid email address'},400);
    const provider = await activeMailProvider(user.id); if(!provider) return json({error:'Connect Outlook or Gmail in Settings first'},400);
    const out = await sendEmailAsUser(user.id,provider,{to:c.email,subject:parsed.data.subject,body:parsed.data.body});
    if(!out.ok) return json({error:out.error},502);
    const note = await sb.from('notes').insert({candidate_id:c.id,owner_user_id:user.id,activity_type:'Email',content:`Email sent via Claude\nSubject: ${parsed.data.subject}\n\n${parsed.data.body}`});
    return json({sent:true,provider,activity_logged:!note.error,warning:note.error?'Email sent but activity could not be logged. Do not resend.':undefined});
  } catch { return json({error:'Delivery could not be confirmed. Check your sent folder before retrying.'},500); }
});
