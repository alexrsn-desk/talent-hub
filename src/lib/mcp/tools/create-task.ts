import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'create_task', title: 'Create task', description: 'Add a follow-up task for yourself; optionally attach it to one record.',
 inputSchema: { title: z.string().trim().min(1).max(20000), due_date: z.string().date().optional(), candidate_id: z.string().uuid().optional(), job_id: z.string().uuid().optional(), client_id: z.string().uuid().optional() },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); for(const [table,id] of [['candidates',args.candidate_id],['jobs',args.job_id],['clients',args.client_id]]) if(id) await requireRecord(sb,table as string,id as string); const {data,error}=await sb.from('todo_tasks').insert({...args,user_id:ctx.getUserId(),owner_user_id:ctx.getUserId()}).select('id,title,due_date').single(); return result(data,error); }
});
