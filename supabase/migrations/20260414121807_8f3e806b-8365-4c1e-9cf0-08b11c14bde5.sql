
-- Remove old check constraint
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;

-- Update existing data to new statuses
UPDATE public.clients SET status = 'Active Client' WHERE status = 'Active';
UPDATE public.clients SET status = 'Conversation Started' WHERE status = 'Warm';
UPDATE public.clients SET status = 'Contacted' WHERE status = 'Cold';

-- Add new check constraint
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check 
  CHECK (status IN ('Target', 'Contacted', 'Conversation Started', 'Meeting Booked', 'Terms Sent', 'Active Client'));

-- Add new columns
ALTER TABLE public.clients ADD COLUMN last_activity_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.clients ADD COLUMN next_action TEXT;
ALTER TABLE public.clients ADD COLUMN next_action_due_date DATE;
