
CREATE TABLE public.ask_desky_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ask_desky_conv_owner ON public.ask_desky_conversations(owner_user_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_desky_conversations TO authenticated;
GRANT ALL ON public.ask_desky_conversations TO service_role;
ALTER TABLE public.ask_desky_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversations" ON public.ask_desky_conversations FOR ALL USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE public.ask_desky_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ask_desky_conversations(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ask_desky_msg_conv ON public.ask_desky_messages(conversation_id, created_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_desky_messages TO authenticated;
GRANT ALL ON public.ask_desky_messages TO service_role;
ALTER TABLE public.ask_desky_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.ask_desky_messages FOR ALL USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER update_ask_desky_conv_updated BEFORE UPDATE ON public.ask_desky_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
