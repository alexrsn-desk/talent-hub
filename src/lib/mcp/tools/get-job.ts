import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'get_job', title: 'View job and pipeline', description: 'Read job specification, intake, extra context, configured stages and up to 100 pipeline entries.',
 inputSchema: { job_id: z.string().uuid() },
 annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); await requireRecord(sb,'jobs',args.job_id); const job=await sb.from('jobs').select('id,title,status,client_id,description,intake_summary,additional_context,launch_hook,ideal_candidate_line,key_skills,location,salary_min,salary_max').eq('id',args.job_id).single(); const stages=await sb.from('job_stages').select('stage_name,stage_order').eq('job_id',args.job_id).order('stage_order'); const pipeline=await sb.from('candidate_jobs').select('id,candidate_id,stage,withdrawn,interview_date').eq('job_id',args.job_id).limit(100); return result({job:job.data,stages:stages.data,pipeline:pipeline.data},job.error??stages.error??pipeline.error); }
});
