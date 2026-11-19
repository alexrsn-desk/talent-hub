import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result, requireRecord } from '../supabase';
import { assertSalaryRange, requireConfirmation } from '../validation';
export default defineTool({
 name: 'create_client', title: 'Create client', description: 'Create a client company on your desk.',
 inputSchema: { company_name: z.string().trim().min(1).max(500), contact_name: z.string().max(500).optional(), email: z.string().email().optional(), phone: z.string().max(100).optional(), sector: z.string().max(500).optional() },
 annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
 handler: async (args, ctx) => { const sb = supabaseForUser(ctx); const {data,error}=await sb.from('clients').insert({...args,owner_user_id:ctx.getUserId()}).select('id,company_name,status').single(); return result(data,error); }
});
