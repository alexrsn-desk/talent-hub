
ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS agency_name text,
  ADD COLUMN IF NOT EXISTS agency_logo_url text,
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#3B82F6';

-- Create storage bucket for agency logos
INSERT INTO storage.buckets (id, name, public) VALUES ('agency-logos', 'agency-logos', true);

-- Storage policies
CREATE POLICY "Anyone can view agency logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'agency-logos');

CREATE POLICY "Authenticated users can upload logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'agency-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update their logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'agency-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete their logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'agency-logos' AND auth.role() = 'authenticated');
