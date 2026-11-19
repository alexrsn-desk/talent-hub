import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'complete_task', title: 'Complete task', description: 'Set a task to complete or reopen it.',
 inputSchema: { task_id: z.string().uuid(), completed: z.boolean() },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); const {data,error}=await sb.from('todo_tasks').update({completed:args.completed,completed_at:args.completed?new Date().toISOString():null}).eq('id',args.task_id).select('id,title,completed').single(); return result(data,error); }
});
