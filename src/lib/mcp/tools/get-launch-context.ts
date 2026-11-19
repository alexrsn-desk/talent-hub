import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'get_launch_context', title: 'Read launch templates', description: 'Read a job’s specification, intake, notes, your messaging templates and agency presets. Use these to draft job ads and sequences in Claude; do not send without confirmation.',
 inputSchema: { job_id: z.string().uuid() },
 annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); await requireRecord(sb,'jobs',args.job_id); const job=await sb.from('jobs').select('id,title,description,intake_summary,additional_context,launch_hook,ideal_candidate_line,key_skills').eq('id',args.job_id).single(); const notes=await sb.from('notes').select('content,activity_type,created_at').eq('job_id',args.job_id).order('created_at',{ascending:false}).limit(20); const templates=await sb.from('recruiter_profiles').select('linkedin_post_template,job_ad_template,personal_candidate_template,li_connection_template,campaign_outreach_template,email_sequence_template').eq('user_id',ctx.getUserId()).maybeSingle(); const presets=await sb.from('job_launch_presets').select('id,name,launch_hook,ideal_candidate_line,campaign_subject,campaign_body,linkedin_post').limit(30); return result({job:job.data,notes:notes.data,templates:templates.data,presets:presets.data},job.error??notes.error??templates.error??presets.error); }
});
