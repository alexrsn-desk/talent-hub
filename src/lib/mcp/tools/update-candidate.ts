import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'update_candidate', title: 'Update candidate', description: 'Update candidate contact, salary and desk details. Cannot clear Do Not Contact, GDPR deletion or ownership.',
 inputSchema: { candidate_id: z.string().uuid(), job_title: z.string().max(500).nullable().optional(), current_employer: z.string().max(500).nullable().optional(), location: z.string().max(500).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().max(100).nullable().optional(), salary_current: z.number().nonnegative().nullable().optional(), salary_expectation: z.number().nonnegative().nullable().optional(), note: z.string().trim().min(1).max(20000).optional(), status: z.enum(['New','Uncontacted','Contacted','Screening','Submitted','Interviewing','Placed','On Hold','Not Suitable','Active']).optional() },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); const {candidate_id,...updates}=args; if(!Object.keys(updates).length) throw new Error('Provide a field to update'); const {data:existing,error:readError}=await sb.from('candidates').select('gdpr_deleted,do_not_contact,status').eq('id',candidate_id).single(); if(readError) return result(null,readError); if(existing.gdpr_deleted) throw new Error('Deleted profiles cannot be updated'); if(existing.status==='Do Not Contact' && updates.status) throw new Error('Do Not Contact cannot be cleared by this tool'); const {data,error}=await sb.from('candidates').update(updates).eq('id',candidate_id).select('id,name,status').single(); return result(data,error); }
});
