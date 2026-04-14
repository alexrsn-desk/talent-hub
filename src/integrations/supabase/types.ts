export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action_type: string
          candidate_id: string | null
          candidate_job_id: string | null
          client_id: string | null
          created_at: string
          id: string
          job_id: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          candidate_id?: string | null
          candidate_job_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          candidate_id?: string | null
          candidate_job_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      call_signals: {
        Row: {
          created_at: string
          explanation: string
          feedback_at: string | null
          feedback_rating: string | null
          feedback_user_id: string | null
          id: string
          note_id: string
          signal_type: string
          status: string
          suggested_action: string
          trigger_phrase: string
        }
        Insert: {
          created_at?: string
          explanation: string
          feedback_at?: string | null
          feedback_rating?: string | null
          feedback_user_id?: string | null
          id?: string
          note_id: string
          signal_type: string
          status?: string
          suggested_action: string
          trigger_phrase: string
        }
        Update: {
          created_at?: string
          explanation?: string
          feedback_at?: string | null
          feedback_rating?: string | null
          feedback_user_id?: string | null
          id?: string
          note_id?: string
          signal_type?: string
          status?: string
          suggested_action?: string
          trigger_phrase?: string
        }
        Relationships: []
      }
      candidate_jobs: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          interview_date: string | null
          job_id: string
          stage: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          interview_date?: string | null
          job_id: string
          stage?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          interview_date?: string | null
          job_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_jobs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_summaries: {
        Row: {
          ai_summary: string | null
          candidate_job_id: string
          created_at: string
          id: string
          manual_summary: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          candidate_job_id: string
          created_at?: string
          id?: string
          manual_summary?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          candidate_job_id?: string
          created_at?: string
          id?: string
          manual_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_summaries_candidate_job_id_fkey"
            columns: ["candidate_job_id"]
            isOneToOne: true
            referencedRelation: "candidate_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          availability: string | null
          created_at: string
          current_employer: string | null
          email: string | null
          id: string
          job_title: string | null
          linkedin_url: string | null
          location: string | null
          name: string
          phone: string | null
          salary_current: number | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          availability?: string | null
          created_at?: string
          current_employer?: string | null
          email?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          name: string
          phone?: string | null
          salary_current?: number | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          availability?: string | null
          created_at?: string
          current_employer?: string | null
          email?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          name?: string
          phone?: string | null
          salary_current?: number | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_feedback: {
        Row: {
          candidate_job_id: string
          client_id: string
          concerns: string | null
          created_at: string
          decision: string | null
          feedback_type: string
          id: string
          rating: number | null
          reason: string | null
          status: string
          strengths: string | null
          updated_at: string
        }
        Insert: {
          candidate_job_id: string
          client_id: string
          concerns?: string | null
          created_at?: string
          decision?: string | null
          feedback_type?: string
          id?: string
          rating?: number | null
          reason?: string | null
          status?: string
          strengths?: string | null
          updated_at?: string
        }
        Update: {
          candidate_job_id?: string
          client_id?: string
          concerns?: string | null
          created_at?: string
          decision?: string | null
          feedback_type?: string
          id?: string
          rating?: number | null
          reason?: string | null
          status?: string
          strengths?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_feedback_candidate_job_id_fkey"
            columns: ["candidate_job_id"]
            isOneToOne: false
            referencedRelation: "candidate_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_access: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          id: string
          last_accessed_at: string | null
          magic_link_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_accessed_at?: string | null
          magic_link_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_accessed_at?: string | null
          magic_link_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          job_title: string | null
          last_activity_date: string | null
          linkedin_url: string | null
          next_action: string | null
          next_action_due_date: string | null
          phone: string | null
          sector: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          last_activity_date?: string | null
          linkedin_url?: string | null
          next_action?: string | null
          next_action_due_date?: string | null
          phone?: string | null
          sector?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          last_activity_date?: string | null
          linkedin_url?: string | null
          next_action?: string | null
          next_action_due_date?: string | null
          phone?: string | null
          sector?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          job_title: string | null
          linkedin_url: string | null
          name: string
          phone: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          linkedin_url?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_slots: {
        Row: {
          candidate_job_id: string
          created_at: string
          end_time: string
          id: string
          selected_by_client: boolean
          start_time: string
          status: string
        }
        Insert: {
          candidate_job_id: string
          created_at?: string
          end_time: string
          id?: string
          selected_by_client?: boolean
          start_time: string
          status?: string
        }
        Update: {
          candidate_job_id?: string
          created_at?: string
          end_time?: string
          id?: string
          selected_by_client?: boolean
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_slots_candidate_job_id_fkey"
            columns: ["candidate_job_id"]
            isOneToOne: false
            referencedRelation: "candidate_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          client_id: string | null
          created_at: string
          date_opened: string
          fee_type: string | null
          fee_value: number | null
          id: string
          job_type: string
          location: string | null
          salary_max: number | null
          salary_min: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          date_opened?: string
          fee_type?: string | null
          fee_value?: number | null
          id?: string
          job_type?: string
          location?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          date_opened?: string
          fee_type?: string | null
          fee_value?: number | null
          id?: string
          job_type?: string
          location?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          activity_type: string
          candidate_id: string | null
          client_id: string | null
          content: string
          created_at: string
          duration: number | null
          follow_up_date: string | null
          id: string
          job_id: string | null
          outcome: string | null
          transcript: string | null
        }
        Insert: {
          activity_type?: string
          candidate_id?: string | null
          client_id?: string | null
          content: string
          created_at?: string
          duration?: number | null
          follow_up_date?: string | null
          id?: string
          job_id?: string | null
          outcome?: string | null
          transcript?: string | null
        }
        Update: {
          activity_type?: string
          candidate_id?: string | null
          client_id?: string | null
          content?: string
          created_at?: string
          duration?: number | null
          follow_up_date?: string | null
          id?: string
          job_id?: string | null
          outcome?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      recruiter_profiles: {
        Row: {
          agency_logo_url: string | null
          agency_name: string | null
          bd_approach: string | null
          biggest_challenge: string | null
          brand_color: string | null
          created_at: string
          display_name: string | null
          id: string
          ideal_candidate: string | null
          location_regional_detail: string | null
          locations: string[] | null
          niche_other: string | null
          niches: string[] | null
          onboarding_completed: boolean
          placement_type: string | null
          salary_max: number | null
          salary_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_logo_url?: string | null
          agency_name?: string | null
          bd_approach?: string | null
          biggest_challenge?: string | null
          brand_color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          ideal_candidate?: string | null
          location_regional_detail?: string | null
          locations?: string[] | null
          niche_other?: string | null
          niches?: string[] | null
          onboarding_completed?: boolean
          placement_type?: string | null
          salary_max?: number | null
          salary_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_logo_url?: string | null
          agency_name?: string | null
          bd_approach?: string | null
          biggest_challenge?: string | null
          brand_color?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          ideal_candidate?: string | null
          location_regional_detail?: string | null
          locations?: string[] | null
          niche_other?: string | null
          niches?: string[] | null
          onboarding_completed?: boolean
          placement_type?: string | null
          salary_max?: number | null
          salary_min?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_summaries: {
        Row: {
          created_at: string
          id: string
          summary: Json
          user_id: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          summary?: Json
          user_id?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          summary?: Json
          user_id?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
