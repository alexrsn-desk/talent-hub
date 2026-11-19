import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser, result } from '../supabase';
export default defineTool({
 name:'update_client', title:'Update client', description:'Update company and contact details without changing agency or ownership.',
 inputSchema:{client_id:z.string().uuid(),company_name:z.string().trim().min(1).max(500).optional(),contact_name:z.string().max(500).nullable().optional(),email:z.string().email().nullable().optional(),phone:z.string().max(100).nullable().optional(),sector:z.string().max(500).nullable().optional(),summary:z.string().max(20000).nullable().optional()},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},
 handler:async({client_id,...updates},ctx)=>{if(!Object.keys(updates).length) throw new Error('Provide a field to update'); const sb=supabaseForUser(ctx);const {data,error}=await sb.from('clients').update(updates).eq('id',client_id).select('id,company_name,email,phone').single();return result(data,error);}
});
