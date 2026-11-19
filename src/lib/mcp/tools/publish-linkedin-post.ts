import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'publish_linkedin_post', title: 'Publish LinkedIn post', description: 'Publish exact text as your connected LinkedIn account. Show the full text and get explicit confirmation first. Never retry automatically.',
 inputSchema: { text: z.string().min(1).max(3000), job_id: z.string().uuid().optional(), confirmed: z.boolean().default(false) },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); requireConfirmation(args.confirmed); if(args.job_id) await requireRecord(sb,'jobs',args.job_id); const {data,error}=await sb.functions.invoke('linkedin-post',{body:{text:args.text,job_id:args.job_id}}); if(error) return result(null,{message:'Publication not confirmed. Check LinkedIn before retrying.'}); return result(data,data?.error?{message:data.error}:null); }
});
