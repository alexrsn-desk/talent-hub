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
      call_insights: {
        Row: {
          candidate_id: string | null
          confidence: string
          created_at: string
          detected_value: string | null
          field_name: string | null
          id: string
          kind: string
          note_id: string
          resolved_at: string | null
          source_quote: string | null
          status: string
          tag_category: string | null
          tag_label: string | null
        }
        Insert: {
          candidate_id?: string | null
          confidence?: string
          created_at?: string
          detected_value?: string | null
          field_name?: string | null
          id?: string
          kind: string
          note_id: string
          resolved_at?: string | null
          source_quote?: string | null
          status?: string
          tag_category?: string | null
          tag_label?: string | null
        }
        Update: {
          candidate_id?: string | null
          confidence?: string
          created_at?: string
          detected_value?: string | null
          field_name?: string | null
          id?: string
          kind?: string
          note_id?: string
          resolved_at?: string | null
          source_quote?: string | null
          status?: string
          tag_category?: string | null
          tag_label?: string | null
        }
        Relationships: []
      }
      call_signals: {
        Row: {
          confidence: string
          created_at: string
          days_unactioned: number
          explanation: string
          feedback_at: string | null
          feedback_rating: string | null
          feedback_user_id: string | null
          first_shown_date: string
          id: string
          note_id: string
          priority_score: number
          signal_category: string
          signal_type: string
          status: string
          suggested_action: string
          suggested_date: string | null
          trigger_phrase: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          days_unactioned?: number
          explanation: string
          feedback_at?: string | null
          feedback_rating?: string | null
          feedback_user_id?: string | null
          first_shown_date?: string
          id?: string
          note_id: string
          priority_score?: number
          signal_category?: string
          signal_type: string
          status?: string
          suggested_action: string
          suggested_date?: string | null
          trigger_phrase: string
        }
        Update: {
          confidence?: string
          created_at?: string
          days_unactioned?: number
          explanation?: string
          feedback_at?: string | null
          feedback_rating?: string | null
          feedback_user_id?: string | null
          first_shown_date?: string
          id?: string
          note_id?: string
          priority_score?: number
          signal_category?: string
          signal_type?: string
          status?: string
          suggested_action?: string
          suggested_date?: string | null
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
          owner_user_id: string | null
          rejection_reason: string | null
          source: string
          stage: string
          stage_changed_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          interview_date?: string | null
          job_id: string
          owner_user_id?: string | null
          rejection_reason?: string | null
          source?: string
          stage?: string
          stage_changed_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          interview_date?: string | null
          job_id?: string
          owner_user_id?: string | null
          rejection_reason?: string | null
          source?: string
          stage?: string
          stage_changed_at?: string
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
      candidate_tags: {
        Row: {
          candidate_id: string
          confidence: string | null
          created_at: string
          id: string
          source: string
          tag_definition_id: string
        }
        Insert: {
          candidate_id: string
          confidence?: string | null
          created_at?: string
          id?: string
          source?: string
          tag_definition_id: string
        }
        Update: {
          candidate_id?: string
          confidence?: string | null
          created_at?: string
          id?: string
          source?: string
          tag_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_tags_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_tags_tag_definition_id_fkey"
            columns: ["tag_definition_id"]
            isOneToOne: false
            referencedRelation: "tag_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          availability: string | null
          created_at: string
          current_employer: string | null
          dnc_channel: string | null
          dnc_notes: string | null
          dnc_reason: string | null
          dnc_reason_other: string | null
          dnc_set_at: string | null
          dnc_set_by: string | null
          do_not_contact: boolean
          email: string | null
          first_name: string | null
          gdpr_deleted: boolean
          gdpr_deleted_at: string | null
          id: string
          incomplete_profile: boolean
          job_title: string | null
          last_name: string | null
          linkedin_url: string | null
          location: string | null
          name: string
          notice_period: string | null
          owner_user_id: string | null
          phone: string | null
          priority_flag: boolean
          priority_flagged_at: string | null
          priority_followup_date: string | null
          priority_reason: string | null
          reengage_date: string | null
          reengage_reason: string | null
          salary_current: number | null
          salary_expectation: number | null
          source: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          created_at?: string
          current_employer?: string | null
          dnc_channel?: string | null
          dnc_notes?: string | null
          dnc_reason?: string | null
          dnc_reason_other?: string | null
          dnc_set_at?: string | null
          dnc_set_by?: string | null
          do_not_contact?: boolean
          email?: string | null
          first_name?: string | null
          gdpr_deleted?: boolean
          gdpr_deleted_at?: string | null
          id?: string
          incomplete_profile?: boolean
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          name: string
          notice_period?: string | null
          owner_user_id?: string | null
          phone?: string | null
          priority_flag?: boolean
          priority_flagged_at?: string | null
          priority_followup_date?: string | null
          priority_reason?: string | null
          reengage_date?: string | null
          reengage_reason?: string | null
          salary_current?: number | null
          salary_expectation?: number | null
          source?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          created_at?: string
          current_employer?: string | null
          dnc_channel?: string | null
          dnc_notes?: string | null
          dnc_reason?: string | null
          dnc_reason_other?: string | null
          dnc_set_at?: string | null
          dnc_set_by?: string | null
          do_not_contact?: boolean
          email?: string | null
          first_name?: string | null
          gdpr_deleted?: boolean
          gdpr_deleted_at?: string | null
          id?: string
          incomplete_profile?: boolean
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          name?: string
          notice_period?: string | null
          owner_user_id?: string | null
          phone?: string | null
          priority_flag?: boolean
          priority_flagged_at?: string | null
          priority_followup_date?: string | null
          priority_reason?: string | null
          reengage_date?: string | null
          reengage_reason?: string | null
          salary_current?: number | null
          salary_expectation?: number | null
          source?: string | null
          status?: string
          summary?: string | null
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
          heat: string
          id: string
          incomplete_profile: boolean
          job_title: string | null
          last_activity_date: string | null
          linkedin_url: string | null
          location: string | null
          next_action: string | null
          next_action_due_date: string | null
          next_followup_date: string | null
          owner_user_id: string | null
          phone: string | null
          sector: string | null
          status: string
          summary: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          heat?: string
          id?: string
          incomplete_profile?: boolean
          job_title?: string | null
          last_activity_date?: string | null
          linkedin_url?: string | null
          location?: string | null
          next_action?: string | null
          next_action_due_date?: string | null
          next_followup_date?: string | null
          owner_user_id?: string | null
          phone?: string | null
          sector?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          heat?: string
          id?: string
          incomplete_profile?: boolean
          job_title?: string | null
          last_activity_date?: string | null
          linkedin_url?: string | null
          location?: string | null
          next_action?: string | null
          next_action_due_date?: string | null
          next_followup_date?: string | null
          owner_user_id?: string | null
          phone?: string | null
          sector?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_intel: {
        Row: {
          client_id: string
          created_at: string
          current_job_postings: Json
          description: string | null
          employee_count: string | null
          enrichment_source: string | null
          field_status: Json
          funding_amount: string | null
          funding_date: string | null
          funding_lead_investors: string[] | null
          funding_stage: string | null
          headquarters: string | null
          id: string
          industry: string | null
          last_enriched_at: string | null
          last_valuation: string | null
          linkedin_url: string | null
          official_name: string | null
          owner_user_id: string
          recent_signals: Json
          revenue_range: string | null
          tech_stack: string[] | null
          total_funding: string | null
          updated_at: string
          website: string | null
          year_founded: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          current_job_postings?: Json
          description?: string | null
          employee_count?: string | null
          enrichment_source?: string | null
          field_status?: Json
          funding_amount?: string | null
          funding_date?: string | null
          funding_lead_investors?: string[] | null
          funding_stage?: string | null
          headquarters?: string | null
          id?: string
          industry?: string | null
          last_enriched_at?: string | null
          last_valuation?: string | null
          linkedin_url?: string | null
          official_name?: string | null
          owner_user_id: string
          recent_signals?: Json
          revenue_range?: string | null
          tech_stack?: string[] | null
          total_funding?: string | null
          updated_at?: string
          website?: string | null
          year_founded?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          current_job_postings?: Json
          description?: string | null
          employee_count?: string | null
          enrichment_source?: string | null
          field_status?: Json
          funding_amount?: string | null
          funding_date?: string | null
          funding_lead_investors?: string[] | null
          funding_stage?: string | null
          headquarters?: string | null
          id?: string
          industry?: string | null
          last_enriched_at?: string | null
          last_valuation?: string | null
          linkedin_url?: string | null
          official_name?: string | null
          owner_user_id?: string
          recent_signals?: Json
          revenue_range?: string | null
          tech_stack?: string[] | null
          total_funding?: string | null
          updated_at?: string
          website?: string | null
          year_founded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_intel_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_audits: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          next_due_date: string
          records_archived: number
          records_deleted: number
          records_kept: number
          records_reviewed: number
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          next_due_date?: string
          records_archived?: number
          records_deleted?: number
          records_kept?: number
          records_reviewed?: number
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          next_due_date?: string
          records_archived?: number
          records_deleted?: number
          records_kept?: number
          records_reviewed?: number
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compliance_log: {
        Row: {
          action: string
          channel: string | null
          created_at: string
          entity_id: string
          entity_name_snapshot: string | null
          entity_type: string
          id: string
          notes: string | null
          owner_user_id: string
          performed_by: string | null
          reason: string | null
          reason_other: string | null
        }
        Insert: {
          action: string
          channel?: string | null
          created_at?: string
          entity_id: string
          entity_name_snapshot?: string | null
          entity_type: string
          id?: string
          notes?: string | null
          owner_user_id: string
          performed_by?: string | null
          reason?: string | null
          reason_other?: string | null
        }
        Update: {
          action?: string
          channel?: string | null
          created_at?: string
          entity_id?: string
          entity_name_snapshot?: string | null
          entity_type?: string
          id?: string
          notes?: string | null
          owner_user_id?: string
          performed_by?: string | null
          reason?: string | null
          reason_other?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          direct_phone: string | null
          dnc_channel: string | null
          dnc_notes: string | null
          dnc_reason: string | null
          dnc_reason_other: string | null
          dnc_set_at: string | null
          dnc_set_by: string | null
          do_not_contact: boolean
          email: string | null
          first_name: string | null
          gdpr_deleted: boolean
          gdpr_deleted_at: string | null
          id: string
          incomplete_profile: boolean
          job_title: string | null
          last_name: string | null
          linkedin_url: string | null
          mobile_phone: string | null
          name: string
          owner_user_id: string | null
          personal_email: string | null
          phone: string | null
          reengage_date: string | null
          reengage_reason: string | null
          status: string
          summary: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          direct_phone?: string | null
          dnc_channel?: string | null
          dnc_notes?: string | null
          dnc_reason?: string | null
          dnc_reason_other?: string | null
          dnc_set_at?: string | null
          dnc_set_by?: string | null
          do_not_contact?: boolean
          email?: string | null
          first_name?: string | null
          gdpr_deleted?: boolean
          gdpr_deleted_at?: string | null
          id?: string
          incomplete_profile?: boolean
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          mobile_phone?: string | null
          name: string
          owner_user_id?: string | null
          personal_email?: string | null
          phone?: string | null
          reengage_date?: string | null
          reengage_reason?: string | null
          status?: string
          summary?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          direct_phone?: string | null
          dnc_channel?: string | null
          dnc_notes?: string | null
          dnc_reason?: string | null
          dnc_reason_other?: string | null
          dnc_set_at?: string | null
          dnc_set_by?: string | null
          do_not_contact?: boolean
          email?: string | null
          first_name?: string | null
          gdpr_deleted?: boolean
          gdpr_deleted_at?: string | null
          id?: string
          incomplete_profile?: boolean
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          mobile_phone?: string | null
          name?: string
          owner_user_id?: string | null
          personal_email?: string | null
          phone?: string | null
          reengage_date?: string | null
          reengage_reason?: string | null
          status?: string
          summary?: string | null
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
      counter_offers: {
        Row: {
          ai_strategy: string | null
          amount_offered: number | null
          candidate_reaction: string | null
          created_at: string
          id: string
          offer_id: string
          other_changes: string | null
          outcome: string
          owner_user_id: string
          received_date: string
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          ai_strategy?: string | null
          amount_offered?: number | null
          candidate_reaction?: string | null
          created_at?: string
          id?: string
          offer_id: string
          other_changes?: string | null
          outcome?: string
          owner_user_id: string
          received_date?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_strategy?: string | null
          amount_offered?: number | null
          candidate_reaction?: string | null
          created_at?: string
          id?: string
          offer_id?: string
          other_changes?: string | null
          outcome?: string
          owner_user_id?: string
          received_date?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_offers_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      decay_alerts: {
        Row: {
          channel_suggestion: string | null
          created_at: string
          days_since_contact: number
          entity_id: string
          entity_type: string
          id: string
          last_scanned_at: string
          owner_user_id: string
          reason: string | null
          reason_generated_at: string | null
          reason_source: string | null
          relationship_kind: string
          resolved_at: string | null
          snoozed_until: string | null
          status: string
          suggested_approach: string | null
          surfaced_at: string | null
          threshold_days: number
          updated_at: string
        }
        Insert: {
          channel_suggestion?: string | null
          created_at?: string
          days_since_contact?: number
          entity_id: string
          entity_type: string
          id?: string
          last_scanned_at?: string
          owner_user_id: string
          reason?: string | null
          reason_generated_at?: string | null
          reason_source?: string | null
          relationship_kind: string
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: string
          suggested_approach?: string | null
          surfaced_at?: string | null
          threshold_days?: number
          updated_at?: string
        }
        Update: {
          channel_suggestion?: string | null
          created_at?: string
          days_since_contact?: number
          entity_id?: string
          entity_type?: string
          id?: string
          last_scanned_at?: string
          owner_user_id?: string
          reason?: string | null
          reason_generated_at?: string | null
          reason_source?: string | null
          relationship_kind?: string
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: string
          suggested_approach?: string | null
          surfaced_at?: string | null
          threshold_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      decay_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          threshold_active: number
          threshold_bd: number
          threshold_general: number
          threshold_key: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          threshold_active?: number
          threshold_bd?: number
          threshold_general?: number
          threshold_key?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          threshold_active?: number
          threshold_bd?: number
          threshold_general?: number
          threshold_key?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      enrichment_usage: {
        Row: {
          client_id: string | null
          cost_pence: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          cost_pence?: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          cost_pence?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          created_at: string
          id: string
          imported_ids: Json | null
          record_type: string
          records_imported: number
          records_skipped: number
          records_updated: number
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          imported_ids?: Json | null
          record_type: string
          records_imported?: number
          records_skipped?: number
          records_updated?: number
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          imported_ids?: Json | null
          record_type?: string
          records_imported?: number
          records_skipped?: number
          records_updated?: number
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      interview_feedback: {
        Row: {
          counter_offer_risk: string | null
          created_at: string
          how_it_went: string | null
          id: string
          interview_id: string
          key_points: string | null
          next_steps: string | null
          notes: string | null
          owner_user_id: string
          source: string
          still_interested: string | null
        }
        Insert: {
          counter_offer_risk?: string | null
          created_at?: string
          how_it_went?: string | null
          id?: string
          interview_id: string
          key_points?: string | null
          next_steps?: string | null
          notes?: string | null
          owner_user_id: string
          source?: string
          still_interested?: string | null
        }
        Update: {
          counter_offer_risk?: string | null
          created_at?: string
          how_it_went?: string | null
          id?: string
          interview_id?: string
          key_points?: string | null
          next_steps?: string | null
          notes?: string | null
          owner_user_id?: string
          source?: string
          still_interested?: string | null
        }
        Relationships: []
      }
      interview_settings: {
        Row: {
          auto_send_confirmation: boolean
          auto_send_reminder: boolean
          created_at: string
          day_before_reminder_time: string
          id: string
          morning_checkin_enabled: boolean
          post_interview_delay_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_send_confirmation?: boolean
          auto_send_reminder?: boolean
          created_at?: string
          day_before_reminder_time?: string
          id?: string
          morning_checkin_enabled?: boolean
          post_interview_delay_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_send_confirmation?: boolean
          auto_send_reminder?: boolean
          created_at?: string
          day_before_reminder_time?: string
          id?: string
          morning_checkin_enabled?: boolean
          post_interview_delay_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      interviews: {
        Row: {
          candidate_feedback_logged_at: string | null
          candidate_id: string
          candidate_job_id: string
          client_chase_sent_at: string | null
          client_feedback_logged_at: string | null
          confirmation_sent_at: string | null
          created_at: string
          day_before_reminder_sent_at: string | null
          details_captured_at: string | null
          duration_mins: number | null
          feedback_chase_snoozed_until: string | null
          format: string | null
          id: string
          interview_type: string | null
          interviewers: string | null
          job_id: string
          location: string | null
          morning_checkin_sent_at: string | null
          outcome: string | null
          owner_user_id: string
          prep_notes: string | null
          prep_sent_at: string | null
          recruiter_advice: string | null
          scheduled_at: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          candidate_feedback_logged_at?: string | null
          candidate_id: string
          candidate_job_id: string
          client_chase_sent_at?: string | null
          client_feedback_logged_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          day_before_reminder_sent_at?: string | null
          details_captured_at?: string | null
          duration_mins?: number | null
          feedback_chase_snoozed_until?: string | null
          format?: string | null
          id?: string
          interview_type?: string | null
          interviewers?: string | null
          job_id: string
          location?: string | null
          morning_checkin_sent_at?: string | null
          outcome?: string | null
          owner_user_id: string
          prep_notes?: string | null
          prep_sent_at?: string | null
          recruiter_advice?: string | null
          scheduled_at?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          candidate_feedback_logged_at?: string | null
          candidate_id?: string
          candidate_job_id?: string
          client_chase_sent_at?: string | null
          client_feedback_logged_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          day_before_reminder_sent_at?: string | null
          details_captured_at?: string | null
          duration_mins?: number | null
          feedback_chase_snoozed_until?: string | null
          format?: string | null
          id?: string
          interview_type?: string | null
          interviewers?: string | null
          job_id?: string
          location?: string | null
          morning_checkin_sent_at?: string | null
          outcome?: string | null
          owner_user_id?: string
          prep_notes?: string | null
          prep_sent_at?: string | null
          recruiter_advice?: string | null
          scheduled_at?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_score_history: {
        Row: {
          created_at: string
          id: string
          job_id: string
          negatives: Json
          owner_user_id: string | null
          positives: Json
          score: number
          snapshot_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          negatives?: Json
          owner_user_id?: string | null
          positives?: Json
          score: number
          snapshot_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          negatives?: Json
          owner_user_id?: string | null
          positives?: Json
          score?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      job_tags: {
        Row: {
          created_at: string
          id: string
          job_id: string
          tag_definition_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          tag_definition_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          tag_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tags_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tags_tag_definition_id_fkey"
            columns: ["tag_definition_id"]
            isOneToOne: false
            referencedRelation: "tag_definitions"
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
          incomplete_profile: boolean
          intake_captured_at: string | null
          intake_notes: Json | null
          intake_summary: string | null
          job_type: string
          location: string | null
          owner_user_id: string | null
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
          incomplete_profile?: boolean
          intake_captured_at?: string | null
          intake_notes?: Json | null
          intake_summary?: string | null
          job_type?: string
          location?: string | null
          owner_user_id?: string | null
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
          incomplete_profile?: boolean
          intake_captured_at?: string | null
          intake_notes?: Json | null
          intake_summary?: string | null
          job_type?: string
          location?: string | null
          owner_user_id?: string | null
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
          owner_user_id: string | null
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
          owner_user_id?: string | null
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
          owner_user_id?: string | null
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
      offer_milestones: {
        Row: {
          created_at: string
          id: string
          milestone_date: string | null
          milestone_type: string
          notes: string | null
          offer_id: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          milestone_date?: string | null
          milestone_type: string
          notes?: string | null
          offer_id: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          milestone_date?: string | null
          milestone_type?: string
          notes?: string | null
          offer_id?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_milestones_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          acceptance_deadline: string | null
          acceptance_reasons: string | null
          acceptance_risk: string | null
          benefits_notes: string | null
          candidate_decision: string
          candidate_expectation_snapshot: number | null
          candidate_id: string
          candidate_job_id: string
          candidate_name_snapshot: string | null
          client_name_snapshot: string | null
          conditions: string[] | null
          conditions_other: string | null
          counter_offer_reasons: string | null
          counter_offer_received_date: string | null
          counter_offer_risk: string | null
          created_at: string
          decision_logged_at: string | null
          earliest_start_date: string | null
          id: string
          job_id: string
          job_title_snapshot: string | null
          notes: string | null
          notice_period_weeks: number | null
          offer_type: string
          overall_risk: string | null
          owner_user_id: string
          pre_start_candidate_briefed: boolean
          pre_start_candidate_called: boolean
          pre_start_client_called: boolean
          pre_start_placement_ready: boolean
          resignation_accepted_date: string | null
          resignation_handed_in_date: string | null
          resignation_planned_date: string | null
          risk_assessed_at: string | null
          salary_currency: string
          salary_offered: number | null
          start_date_confirmed: string | null
          start_date_proposed: string | null
          start_date_reasons: string | null
          start_date_risk: string | null
          status: string
          updated_at: string
          verbal_offer_date: string | null
          written_offer_date: string | null
        }
        Insert: {
          acceptance_deadline?: string | null
          acceptance_reasons?: string | null
          acceptance_risk?: string | null
          benefits_notes?: string | null
          candidate_decision?: string
          candidate_expectation_snapshot?: number | null
          candidate_id: string
          candidate_job_id: string
          candidate_name_snapshot?: string | null
          client_name_snapshot?: string | null
          conditions?: string[] | null
          conditions_other?: string | null
          counter_offer_reasons?: string | null
          counter_offer_received_date?: string | null
          counter_offer_risk?: string | null
          created_at?: string
          decision_logged_at?: string | null
          earliest_start_date?: string | null
          id?: string
          job_id: string
          job_title_snapshot?: string | null
          notes?: string | null
          notice_period_weeks?: number | null
          offer_type?: string
          overall_risk?: string | null
          owner_user_id: string
          pre_start_candidate_briefed?: boolean
          pre_start_candidate_called?: boolean
          pre_start_client_called?: boolean
          pre_start_placement_ready?: boolean
          resignation_accepted_date?: string | null
          resignation_handed_in_date?: string | null
          resignation_planned_date?: string | null
          risk_assessed_at?: string | null
          salary_currency?: string
          salary_offered?: number | null
          start_date_confirmed?: string | null
          start_date_proposed?: string | null
          start_date_reasons?: string | null
          start_date_risk?: string | null
          status?: string
          updated_at?: string
          verbal_offer_date?: string | null
          written_offer_date?: string | null
        }
        Update: {
          acceptance_deadline?: string | null
          acceptance_reasons?: string | null
          acceptance_risk?: string | null
          benefits_notes?: string | null
          candidate_decision?: string
          candidate_expectation_snapshot?: number | null
          candidate_id?: string
          candidate_job_id?: string
          candidate_name_snapshot?: string | null
          client_name_snapshot?: string | null
          conditions?: string[] | null
          conditions_other?: string | null
          counter_offer_reasons?: string | null
          counter_offer_received_date?: string | null
          counter_offer_risk?: string | null
          created_at?: string
          decision_logged_at?: string | null
          earliest_start_date?: string | null
          id?: string
          job_id?: string
          job_title_snapshot?: string | null
          notes?: string | null
          notice_period_weeks?: number | null
          offer_type?: string
          overall_risk?: string | null
          owner_user_id?: string
          pre_start_candidate_briefed?: boolean
          pre_start_candidate_called?: boolean
          pre_start_client_called?: boolean
          pre_start_placement_ready?: boolean
          resignation_accepted_date?: string | null
          resignation_handed_in_date?: string | null
          resignation_planned_date?: string | null
          risk_assessed_at?: string | null
          salary_currency?: string
          salary_offered?: number | null
          start_date_confirmed?: string | null
          start_date_proposed?: string | null
          start_date_reasons?: string | null
          start_date_risk?: string | null
          status?: string
          updated_at?: string
          verbal_offer_date?: string | null
          written_offer_date?: string | null
        }
        Relationships: []
      }
      placement_checkins: {
        Row: {
          checkin_type: string
          completed: boolean
          completed_at: string | null
          concern_flagged: boolean
          concern_summary: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          owner_user_id: string
          placement_id: string
          updated_at: string
        }
        Insert: {
          checkin_type: string
          completed?: boolean
          completed_at?: string | null
          concern_flagged?: boolean
          concern_summary?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          owner_user_id: string
          placement_id: string
          updated_at?: string
        }
        Update: {
          checkin_type?: string
          completed?: boolean
          completed_at?: string | null
          concern_flagged?: boolean
          concern_summary?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          owner_user_id?: string
          placement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_checkins_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          candidate_id: string
          candidate_job_id: string | null
          candidate_name_snapshot: string | null
          client_id: string | null
          client_name_snapshot: string | null
          created_at: string
          fall_through_at: string | null
          fall_through_reason: string | null
          fee_amount: number | null
          fee_percentage: number | null
          fee_type: string
          guarantee_expiry_date: string | null
          guarantee_weeks: number
          id: string
          invoice_date: string | null
          invoice_due_date: string | null
          invoice_paid: boolean
          invoice_paid_at: string | null
          invoice_raised: boolean
          invoice_raised_at: string | null
          job_id: string | null
          job_title_snapshot: string | null
          notes: string | null
          offer_accepted_date: string | null
          owner_user_id: string
          payment_terms_days: number
          salary_placed_at: number | null
          source: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          candidate_job_id?: string | null
          candidate_name_snapshot?: string | null
          client_id?: string | null
          client_name_snapshot?: string | null
          created_at?: string
          fall_through_at?: string | null
          fall_through_reason?: string | null
          fee_amount?: number | null
          fee_percentage?: number | null
          fee_type?: string
          guarantee_expiry_date?: string | null
          guarantee_weeks?: number
          id?: string
          invoice_date?: string | null
          invoice_due_date?: string | null
          invoice_paid?: boolean
          invoice_paid_at?: string | null
          invoice_raised?: boolean
          invoice_raised_at?: string | null
          job_id?: string | null
          job_title_snapshot?: string | null
          notes?: string | null
          offer_accepted_date?: string | null
          owner_user_id: string
          payment_terms_days?: number
          salary_placed_at?: number | null
          source?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          candidate_job_id?: string | null
          candidate_name_snapshot?: string | null
          client_id?: string | null
          client_name_snapshot?: string | null
          created_at?: string
          fall_through_at?: string | null
          fall_through_reason?: string | null
          fee_amount?: number | null
          fee_percentage?: number | null
          fee_type?: string
          guarantee_expiry_date?: string | null
          guarantee_weeks?: number
          id?: string
          invoice_date?: string | null
          invoice_due_date?: string | null
          invoice_paid?: boolean
          invoice_paid_at?: string | null
          invoice_raised?: boolean
          invoice_raised_at?: string | null
          job_id?: string | null
          job_title_snapshot?: string | null
          notes?: string | null
          offer_accepted_date?: string | null
          owner_user_id?: string
          payment_terms_days?: number
          salary_placed_at?: number | null
          source?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      quick_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          owner_user_id: string
          reviewed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          owner_user_id: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          owner_user_id?: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
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
          enrichment_budget_pence: number
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
          enrichment_budget_pence?: number
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
          enrichment_budget_pence?: number
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
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          owner_user_id: string
          query: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          owner_user_id: string
          query?: string | null
          scope: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          owner_user_id?: string
          query?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      screening_notes: {
        Row: {
          availability_confirmed: string | null
          candidate_job_id: string
          completed: boolean
          concerns: string | null
          created_at: string
          id: string
          interest_level: string | null
          key_strengths: string | null
          notice_period_confirmed: string | null
          questions_answered: string | null
          salary_confirmed: number | null
          updated_at: string
          why_suitable: string | null
        }
        Insert: {
          availability_confirmed?: string | null
          candidate_job_id: string
          completed?: boolean
          concerns?: string | null
          created_at?: string
          id?: string
          interest_level?: string | null
          key_strengths?: string | null
          notice_period_confirmed?: string | null
          questions_answered?: string | null
          salary_confirmed?: number | null
          updated_at?: string
          why_suitable?: string | null
        }
        Update: {
          availability_confirmed?: string | null
          candidate_job_id?: string
          completed?: boolean
          concerns?: string | null
          created_at?: string
          id?: string
          interest_level?: string | null
          key_strengths?: string | null
          notice_period_confirmed?: string | null
          questions_answered?: string | null
          salary_confirmed?: number | null
          updated_at?: string
          why_suitable?: string | null
        }
        Relationships: []
      }
      screening_preferences: {
        Row: {
          created_at: string
          examples: string[]
          id: string
          length: string
          pov: string
          sections: Json
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          examples?: string[]
          id?: string
          length?: string
          pov?: string
          sections?: Json
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          examples?: string[]
          id?: string
          length?: string
          pov?: string
          sections?: Json
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sequence_enrollments: {
        Row: {
          candidate_id: string | null
          client_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          current_step: number
          entity_id: string | null
          entity_type: string | null
          id: string
          job_id: string | null
          paused_at: string | null
          sequence_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          candidate_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          current_step?: number
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          job_id?: string | null
          paused_at?: string | null
          sequence_id: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          current_step?: number
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          job_id?: string | null
          paused_at?: string | null
          sequence_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_step_logs: {
        Row: {
          channel_used: string | null
          created_at: string
          due_date: string
          enrollment_id: string
          id: string
          logged_at: string | null
          note: string | null
          status: string
          step_number: number
        }
        Insert: {
          channel_used?: string | null
          created_at?: string
          due_date: string
          enrollment_id: string
          id?: string
          logged_at?: string | null
          note?: string | null
          status?: string
          step_number: number
        }
        Update: {
          channel_used?: string | null
          created_at?: string
          due_date?: string
          enrollment_id?: string
          id?: string
          logged_at?: string | null
          note?: string | null
          status?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sequence_step_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "sequence_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          channel: string
          created_at: string
          day_offset: number
          id: string
          message_prompt: string | null
          note: string | null
          sequence_id: string
          step_number: number
        }
        Insert: {
          channel?: string
          created_at?: string
          day_offset?: number
          id?: string
          message_prompt?: string | null
          note?: string | null
          sequence_id: string
          step_number: number
        }
        Update: {
          channel?: string
          created_at?: string
          day_offset?: number
          id?: string
          message_prompt?: string | null
          note?: string | null
          sequence_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          steps: Json
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          steps?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          steps?: Json
        }
        Relationships: []
      }
      sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      signal_preferences: {
        Row: {
          created_at: string
          daily_limit: number
          enabled_categories: Json
          enabled_signals: Json
          id: string
          show_low_confidence: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          enabled_categories?: Json
          enabled_signals?: Json
          id?: string
          show_low_confidence?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          enabled_categories?: Json
          enabled_signals?: Json
          id?: string
          show_low_confidence?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tag_definitions: {
        Row: {
          archived: boolean
          category: string
          created_at: string
          id: string
          label: string
          position: number
        }
        Insert: {
          archived?: boolean
          category: string
          created_at?: string
          id?: string
          label: string
          position?: number
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string
          id?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          code: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          manager_user_id: string
          name: string | null
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          manager_user_id: string
          name?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          manager_user_id?: string
          name?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          joined_date: string | null
          manager_user_id: string
          member_user_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          joined_date?: string | null
          manager_user_id: string
          member_user_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          joined_date?: string | null
          manager_user_id?: string
          member_user_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      todo_tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          owner_user_id: string | null
          position: number
          priority: string
          recurrence: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_user_id?: string | null
          position?: number
          priority?: string
          recurrence?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_user_id?: string | null
          position?: number
          priority?: string
          recurrence?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          created_at: string
          feature_type: string
          id: string
          is_grace_extension: boolean | null
          month_year: string
          token_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_type: string
          id?: string
          is_grace_extension?: boolean | null
          month_year: string
          token_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          feature_type?: string
          id?: string
          is_grace_extension?: boolean | null
          month_year?: string
          token_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_plans: {
        Row: {
          billing_start_date: string
          created_at: string
          grace_used_this_month: boolean | null
          id: string
          next_reset_date: string
          plan_type: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_start_date?: string
          created_at?: string
          grace_used_this_month?: boolean | null
          id?: string
          next_reset_date?: string
          plan_type?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_start_date?: string
          created_at?: string
          grace_used_this_month?: boolean | null
          id?: string
          next_reset_date?: string
          plan_type?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          action: string
          created_at: string
          entity_type: string
          error_message: string | null
          id: string
          payload: Json | null
          processing_ms: number | null
          record_id: string | null
          record_name: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_type: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          processing_ms?: number | null
          record_id?: string | null
          record_name?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          processing_ms?: number | null
          record_id?: string | null
          record_name?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_settings: {
        Row: {
          auto_create_clients: boolean
          consecutive_failures: number
          created_at: string
          id: string
          run_signal_detection: boolean
          secret_key: string
          show_in_activity_feed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_create_clients?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          run_signal_detection?: boolean
          secret_key?: string
          show_in_activity_feed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_create_clients?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          run_signal_detection?: boolean
          secret_key?: string
          show_in_activity_feed?: boolean
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
      can_access_owner: { Args: { _owner: string }; Returns: boolean }
      claim_team_invite: { Args: { _code: string }; Returns: string }
      clear_user_data: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "manager" | "consultant" | "solo"
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
    Enums: {
      app_role: ["manager", "consultant", "solo"],
    },
  },
} as const
