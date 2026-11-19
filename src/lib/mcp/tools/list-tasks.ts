import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'list_tasks', title: 'List tasks', description: 'Read up to 50 tasks, optionally filtering completed tasks.',
 inputSchema: { completed: z.boolean().optional() },
 annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); let q=sb.from('todo_tasks').select('id,title,due_date,completed,priority,candidate_id,job_id,client_id').order('due_date').limit(50); if(args.completed!==undefined) q=q.eq('completed',args.completed); const {data,error}=await q; return result(data,error); }
});
