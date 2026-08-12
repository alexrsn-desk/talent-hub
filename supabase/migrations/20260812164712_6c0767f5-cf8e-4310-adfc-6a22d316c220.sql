CREATE POLICY "Portal owner reads own portal files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'portal-files' AND owner = auth.uid());

CREATE POLICY "Portal owner uploads portal files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portal-files' AND owner = auth.uid());

CREATE POLICY "Portal owner updates own portal files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'portal-files' AND owner = auth.uid());

CREATE POLICY "Portal owner deletes own portal files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'portal-files' AND owner = auth.uid());