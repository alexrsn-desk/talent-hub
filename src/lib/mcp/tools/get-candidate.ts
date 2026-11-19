import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'get_candidate', title: 'View candidate', description: 'Read a candidate profile and the latest 30 notes and pipeline links.',
 inputSchema: { candidate_id: z.string().uuid() },
 annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); await requireRecord(sb,'candidates',args.candidate_id); const profile=await sb.from('candidates').select('id,name,job_title,current_employer,location,email,phone,status,salary_current,salary_expectation,note,summary,do_not_contact,gdpr_deleted').eq('id',args.candidate_id).single(); const notes=await sb.from('notes').select('id,content,activity_type,created_at').eq('candidate_id',args.candidate_id).order('created_at',{ascending:false}).limit(30); const pipeline=await sb.from('candidate_jobs').select('id,job_id,stage,withdrawn').eq('candidate_id',args.candidate_id).limit(30); if(notes.error||pipeline.error) return result(null,notes.error??pipeline.error); return result({profile:profile.data,notes:notes.data,pipeline:pipeline.data},profile.error); }
});
