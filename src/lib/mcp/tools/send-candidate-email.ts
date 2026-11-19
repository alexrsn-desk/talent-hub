import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'send_candidate_email', title: 'Send candidate email', description: 'Send an exact email from your connected Outlook or Gmail. First show the recipient, subject and body and get explicit confirmation. DNC is blocked. Never retry automatically.',
 inputSchema: { candidate_id: z.string().uuid(), subject: z.string().min(1).max(500).regex(/^[^\r\n]+$/), body: z.string().trim().min(1).max(20000), confirmed: z.boolean().default(false) },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); requireConfirmation(args.confirmed); const {data,error}=await sb.functions.invoke('mcp-send-email',{body:args}); if(error) return result(null,{message:'Email not confirmed as sent. Check your mailbox before retrying.'}); return result(data,data?.error?{message:data.error}:null); }
});
