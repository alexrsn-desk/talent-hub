import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'create_candidate', title: 'Create candidate', description: 'Create a candidate on your desk. Does not send messages.',
 inputSchema: { first_name: z.string().trim().min(1).max(100), last_name: z.string().trim().min(1).max(100), job_title: z.string().max(500).nullable().optional(), current_employer: z.string().max(500).nullable().optional(), location: z.string().max(500).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().max(100).nullable().optional(), salary_current: z.number().nonnegative().nullable().optional(), salary_expectation: z.number().nonnegative().nullable().optional(), note: z.string().trim().min(1).max(20000).optional(), status: z.enum(['New','Uncontacted','Contacted','Screening','Submitted','Interviewing','Placed','On Hold','Not Suitable','Active']).optional() },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); const {data,error}=await sb.from('candidates').insert({...args,name:args.first_name+' '+args.last_name,owner_user_id:ctx.getUserId()}).select('id,name,status').single(); return result(data,error); }
});
