import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TodoTask = {
  id: string;
  user_id: string | null;
  title: string;
  due_date: string | null;
  priority: string;
  position: number;
  completed: boolean;
  completed_at: string | null;
  recurrence: string | null;
  created_at: string;
};

export function useTodos() {
  return useQuery({
    queryKey: ["todo-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todo_tasks" as any)
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TodoTask[];
    },
  });
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: { title: string; due_date?: string | null; priority?: string; recurrence?: string | null }) => {
      // Get max position
      const { data: existing } = await supabase
        .from("todo_tasks" as any)
        .select("position")
        .order("position", { ascending: false })
        .limit(1);
      const maxPos = (existing as any)?.[0]?.position ?? -1;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("todo_tasks" as any)
        .insert({ ...task, position: maxPos + 1, owner_user_id: user?.id, user_id: user?.id } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todo-tasks"] }),
  });
}

export function useUpdateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TodoTask>) => {
      const { error } = await supabase
        .from("todo_tasks" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todo-tasks"] }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("todo_tasks" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todo-tasks"] }),
  });
}

export function useReorderTodos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      for (const item of items) {
        await supabase
          .from("todo_tasks" as any)
          .update({ position: item.position } as any)
          .eq("id", item.id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todo-tasks"] }),
  });
}
