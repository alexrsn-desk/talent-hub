// Single switch for every SourceWhale sync in the app.
//
// Flip to `true` to resume syncing. The server-side twin of this flag lives in
// supabase/functions/_shared/sourcewhale.ts (SOURCEWHALE_SYNC_ENABLED) and must be
// flipped in the same change, otherwise the edge functions keep refusing requests.
// The scheduled background jobs also have to be re-created when syncing is resumed.
export const SOURCEWHALE_SYNC_ENABLED = false;

export const SOURCEWHALE_SYNC_PAUSED_MESSAGE =
  "SourceWhale syncing is switched off. Anything already in Desky stays visible and editable.";
