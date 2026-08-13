CREATE POLICY "portal staff manage cvs" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'cvs') WITH CHECK (bucket_id = 'cvs');

CREATE POLICY "portal staff manage job specs" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'job-specs') WITH CHECK (bucket_id = 'job-specs');