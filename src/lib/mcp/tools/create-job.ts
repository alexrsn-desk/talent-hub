import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'create_job', title: 'Create job', description: 'Create a job on your desk, with specification and intake details. Spott re-sync may replace imported information.',
 inputSchema: { title: z.string().trim().min(1).max(20000), client_id: z.string().uuid().nullable().optional(), location: z.string().max(500).nullable().optional(), description: z.string().trim().min(1).max(20000).optional(), intake_summary: z.string().trim().min(1).max(20000).optional(), additional_context: z.string().trim().min(1).max(20000).optional(), salary_min: z.number().nonnegative().nullable().optional(), salary_max: z.number().nonnegative().nullable().optional(), job_type: z.enum(['Perm','Contract']).optional(), status: z.enum(['Active','On Hold','Filled','Closed']).optional(), key_skills: z.array(z.string().max(100)).max(50).optional(), launch_hook: z.string().trim().min(1).max(20000).optional(), ideal_candidate_line: z.string().trim().min(1).max(20000).optional() },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); assertSalaryRange(args.salary_min,args.salary_max); if(args.client_id) await requireRecord(sb,'clients',args.client_id); const {data,error}=await sb.from('jobs').insert({...args,owner_user_id:ctx.getUserId()}).select('id,title,status,description,intake_summary').single(); return result(data,error); }
});
