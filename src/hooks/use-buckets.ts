import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type BucketEntityType = "candidate" | "contact" | "client";

export type Bucket = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
};

export type BucketItem = {
  id: string;
  bucket_id: string;
  entity_type: BucketEntityType;
  entity_id: string;
  owner_user_id: string;
  added_at: string;
};

export function useBuckets() {
  return useQuery({
    queryKey: ["buckets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buckets" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data as unknown as Bucket[]) || [];
    },
  });
}

export function useBucketItems() {
  return useQuery({
    queryKey: ["bucket_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bucket_items" as any).select("*");
      if (error) throw error;
      return (data as unknown as BucketItem[]) || [];
    },
  });
}

export function useEntityBuckets(entityType: BucketEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ["entity_buckets", entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bucket_items" as any)
        .select("bucket_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!);
      if (error) throw error;
      return ((data as any[]) || []).map((r) => r.bucket_id as string);
    },
  });
}

export function useCreateBucket() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("buckets" as any)
        .insert({
          owner_user_id: user.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Bucket;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["buckets"] }),
  });
}

export function useDeleteBucket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("buckets" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buckets"] });
      qc.invalidateQueries({ queryKey: ["bucket_items"] });
    },
  });
}

export function useAddToBuckets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      bucketIds,
    }: {
      entityType: BucketEntityType;
      entityId: string;
      bucketIds: string[];
    }) => {
      if (!user) throw new Error("Not signed in");
      if (bucketIds.length === 0) return;
      const rows = bucketIds.map((bid) => ({
        bucket_id: bid,
        entity_type: entityType,
        entity_id: entityId,
        owner_user_id: user.id,
        added_by: user.id,
      }));
      const { error } = await supabase
        .from("bucket_items" as any)
        .upsert(rows as any, { onConflict: "bucket_id,entity_type,entity_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["bucket_items"] });
      qc.invalidateQueries({ queryKey: ["entity_buckets", vars.entityType, vars.entityId] });
    },
  });
}

export function useSetEntityBuckets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      bucketIds,
    }: {
      entityType: BucketEntityType;
      entityId: string;
      bucketIds: string[];
    }) => {
      if (!user) throw new Error("Not signed in");
      const { data: existing } = await supabase
        .from("bucket_items" as any)
        .select("bucket_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      const have = new Set(((existing as any[]) || []).map((r) => r.bucket_id as string));
      const want = new Set(bucketIds);
      const toAdd = [...want].filter((b) => !have.has(b));
      const toRemove = [...have].filter((b) => !want.has(b));
      if (toAdd.length) {
        await supabase.from("bucket_items" as any).insert(
          toAdd.map((bid) => ({
            bucket_id: bid,
            entity_type: entityType,
            entity_id: entityId,
            owner_user_id: user.id,
            added_by: user.id,
          })) as any
        );
      }
      if (toRemove.length) {
        await supabase
          .from("bucket_items" as any)
          .delete()
          .eq("entity_type", entityType)
          .eq("entity_id", entityId)
          .in("bucket_id", toRemove);
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["bucket_items"] });
      qc.invalidateQueries({ queryKey: ["entity_buckets", vars.entityType, vars.entityId] });
    },
  });
}
