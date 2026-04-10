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
      alert_rules: {
        Row: {
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          delivery_config: Json
          id: string
          is_enabled: boolean
          name: string
          organization_id: string
          trigger_config: Json
          updated_at: string
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          delivery_config?: Json
          id?: string
          is_enabled?: boolean
          name: string
          organization_id: string
          trigger_config?: Json
          updated_at?: string
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          delivery_config?: Json
          id?: string
          is_enabled?: boolean
          name?: string
          organization_id?: string
          trigger_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          last_used_at: string | null
          organization_id: string
          revoked_at: string | null
          scopes: Json
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          organization_id: string
          revoked_at?: string | null
          scopes?: Json
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          scopes?: Json
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          autopay_enabled: boolean
          billing_email: string | null
          created_at: string
          currency: string
          id: string
          organization_id: string
          per_minute_rate_cents: number
          recharge_amount_cents: number
          recharge_threshold_cents: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          autopay_enabled?: boolean
          billing_email?: string | null
          created_at?: string
          currency?: string
          id?: string
          organization_id: string
          per_minute_rate_cents?: number
          recharge_amount_cents?: number
          recharge_threshold_cents?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          autopay_enabled?: boolean
          billing_email?: string | null
          created_at?: string
          currency?: string
          id?: string
          organization_id?: string
          per_minute_rate_cents?: number
          recharge_amount_cents?: number
          recharge_threshold_cents?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_analyses: {
        Row: {
          analysis_version: string
          call_id: string
          confidence: number | null
          created_at: string
          disposition_suggested: string | null
          flag_summary: Json
          id: string
          model_name: string
          organization_id: string
          processing_ms: number | null
          structured_output: Json
          summary: string | null
        }
        Insert: {
          analysis_version: string
          call_id: string
          confidence?: number | null
          created_at?: string
          disposition_suggested?: string | null
          flag_summary?: Json
          id?: string
          model_name: string
          organization_id: string
          processing_ms?: number | null
          structured_output?: Json
          summary?: string | null
        }
        Update: {
          analysis_version?: string
          call_id?: string
          confidence?: number | null
          created_at?: string
          disposition_suggested?: string | null
          flag_summary?: Json
          id?: string
          model_name?: string
          organization_id?: string
          processing_ms?: number | null
          structured_output?: Json
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_analyses_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_flags: {
        Row: {
          call_id: string
          created_at: string
          description: string | null
          evidence: Json
          flag_category: string
          flag_type: string
          id: string
          organization_id: string
          severity: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          call_id: string
          created_at?: string
          description?: string | null
          evidence?: Json
          flag_category: string
          flag_type: string
          id?: string
          organization_id: string
          severity: string
          source: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          call_id?: string
          created_at?: string
          description?: string | null
          evidence?: Json
          flag_category?: string
          flag_type?: string
          id?: string
          organization_id?: string
          severity?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_flags_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_reviews: {
        Row: {
          call_id: string
          created_at: string
          final_disposition: string | null
          id: string
          organization_id: string
          resolved_flags: Json
          review_notes: string | null
          review_status: Database["public"]["Enums"]["call_review_status"]
          reviewed_by: string
        }
        Insert: {
          call_id: string
          created_at?: string
          final_disposition?: string | null
          id?: string
          organization_id: string
          resolved_flags?: Json
          review_notes?: string | null
          review_status: Database["public"]["Enums"]["call_review_status"]
          reviewed_by: string
        }
        Update: {
          call_id?: string
          created_at?: string
          final_disposition?: string | null
          id?: string
          organization_id?: string
          resolved_flags?: Json
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["call_review_status"]
          reviewed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_reviews_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_source_snapshots: {
        Row: {
          call_id: string
          created_at: string
          id: string
          mapping_version: string
          normalized_payload: Json
          organization_id: string
          raw_payload: Json
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_provider: Database["public"]["Enums"]["integration_provider"]
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          mapping_version?: string
          normalized_payload?: Json
          organization_id: string
          raw_payload: Json
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_provider: Database["public"]["Enums"]["integration_provider"]
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          mapping_version?: string
          normalized_payload?: Json
          organization_id?: string
          raw_payload?: Json
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_provider?: Database["public"]["Enums"]["integration_provider"]
        }
        Relationships: [
          {
            foreignKeyName: "call_source_snapshots_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_source_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          call_id: string
          confidence: number | null
          created_at: string
          id: string
          language: string
          organization_id: string
          search_document: unknown
          transcript_segments: Json
          transcript_text: string
          updated_at: string
        }
        Insert: {
          call_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          language?: string
          organization_id: string
          search_document?: unknown
          transcript_segments?: Json
          transcript_text: string
          updated_at?: string
        }
        Update: {
          call_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          language?: string
          organization_id?: string
          search_document?: unknown
          transcript_segments?: Json
          transcript_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_transcripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          analysis_status: string
          caller_number: string
          campaign_id: string | null
          created_at: string
          current_disposition: string | null
          current_review_status: Database["public"]["Enums"]["call_review_status"]
          dedupe_hash: string | null
          destination_number: string | null
          duration_seconds: number
          ended_at: string | null
          external_call_id: string | null
          flag_count: number
          has_flags: boolean
          id: string
          import_batch_id: string | null
          integration_id: string | null
          organization_id: string
          publisher_id: string | null
          recording_storage_path: string | null
          recording_url: string | null
          search_document: unknown
          source_provider: Database["public"]["Enums"]["integration_provider"]
          source_status: string
          started_at: string
          updated_at: string
        }
        Insert: {
          analysis_status?: string
          caller_number: string
          campaign_id?: string | null
          created_at?: string
          current_disposition?: string | null
          current_review_status?: Database["public"]["Enums"]["call_review_status"]
          dedupe_hash?: string | null
          destination_number?: string | null
          duration_seconds?: number
          ended_at?: string | null
          external_call_id?: string | null
          flag_count?: number
          has_flags?: boolean
          id?: string
          import_batch_id?: string | null
          integration_id?: string | null
          organization_id: string
          publisher_id?: string | null
          recording_storage_path?: string | null
          recording_url?: string | null
          search_document?: unknown
          source_provider: Database["public"]["Enums"]["integration_provider"]
          source_status?: string
          started_at: string
          updated_at?: string
        }
        Update: {
          analysis_status?: string
          caller_number?: string
          campaign_id?: string | null
          created_at?: string
          current_disposition?: string | null
          current_review_status?: Database["public"]["Enums"]["call_review_status"]
          dedupe_hash?: string | null
          destination_number?: string | null
          duration_seconds?: number
          ended_at?: string | null
          external_call_id?: string | null
          flag_count?: number
          has_flags?: boolean
          id?: string
          import_batch_id?: string | null
          integration_id?: string | null
          organization_id?: string
          publisher_id?: string | null
          recording_storage_path?: string | null
          recording_url?: string | null
          search_document?: unknown
          source_provider?: Database["public"]["Enums"]["integration_provider"]
          source_status?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          external_refs: Json
          id: string
          name: string
          normalized_name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_refs?: Json
          id?: string
          name: string
          normalized_name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_refs?: Json
          id?: string
          name?: string
          normalized_name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      disposition_overrides: {
        Row: {
          call_id: string
          changed_by: string
          created_at: string
          id: string
          new_disposition: string
          organization_id: string
          previous_disposition: string | null
          reason: string
        }
        Insert: {
          call_id: string
          changed_by: string
          created_at?: string
          id?: string
          new_disposition: string
          organization_id: string
          previous_disposition?: string | null
          reason: string
        }
        Update: {
          call_id?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_disposition?: string
          organization_id?: string
          previous_disposition?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "disposition_overrides_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disposition_overrides_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disposition_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          filename: string
          id: string
          integration_id: string | null
          organization_id: string
          row_count_accepted: number
          row_count_rejected: number
          row_count_total: number
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_provider: Database["public"]["Enums"]["integration_provider"]
          started_at: string | null
          status: Database["public"]["Enums"]["import_batch_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          filename: string
          id?: string
          integration_id?: string | null
          organization_id: string
          row_count_accepted?: number
          row_count_rejected?: number
          row_count_total?: number
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_provider: Database["public"]["Enums"]["integration_provider"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_batch_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          filename?: string
          id?: string
          integration_id?: string | null
          organization_id?: string
          row_count_accepted?: number
          row_count_rejected?: number
          row_count_total?: number
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_provider?: Database["public"]["Enums"]["integration_provider"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_batch_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_row_errors: {
        Row: {
          created_at: string
          error_code: string
          error_message: string
          id: string
          import_batch_id: string
          organization_id: string
          raw_row: Json
          row_number: number
        }
        Insert: {
          created_at?: string
          error_code: string
          error_message: string
          id?: string
          import_batch_id: string
          organization_id: string
          raw_row: Json
          row_number: number
        }
        Update: {
          created_at?: string
          error_code?: string
          error_message?: string
          id?: string
          import_batch_id?: string
          organization_id?: string
          raw_row?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_row_errors_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_errors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          integration_id: string
          message: string
          organization_id: string
          payload: Json
          severity: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          integration_id: string
          message: string
          organization_id: string
          payload?: Json
          severity?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          integration_id?: string
          message?: string
          organization_id?: string
          payload?: Json
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          id: string
          last_error_at: string | null
          last_success_at: string | null
          mode: Database["public"]["Enums"]["source_kind"]
          organization_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          last_error_at?: string | null
          last_success_at?: string | null
          mode?: Database["public"]["Enums"]["source_kind"]
          organization_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          last_error_at?: string | null
          last_success_at?: string | null
          mode?: Database["public"]["Enums"]["source_kind"]
          organization_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          alert_rule_id: string | null
          created_at: string
          destination: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          status: string
        }
        Insert: {
          alert_rule_id?: string | null
          created_at?: string
          destination: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          status?: string
        }
        Update: {
          alert_rule_id?: string | null
          created_at?: string
          destination?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_alert_rule_id_fkey"
            columns: ["alert_rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invite_email: string | null
          invite_status: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_status?: string
          invited_by?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_status?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      publishers: {
        Row: {
          created_at: string
          external_refs: Json
          id: string
          name: string
          normalized_name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_refs?: Json
          id?: string
          name: string
          normalized_name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_refs?: Json
          id?: string
          name?: string
          normalized_name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          config: Json
          created_at: string
          entity_type: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          entity_type?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          entity_type?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger_entries: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          billing_account_id: string
          created_at: string
          description: string | null
          entry_type: string
          id: string
          organization_id: string
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          billing_account_id: string
          created_at?: string
          description?: string | null
          entry_type: string
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          billing_account_id?: string
          created_at?: string
          description?: string | null
          entry_type?: string
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_entries_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["organization_role"][]
          org_id: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
    }
    Enums: {
      call_review_status: "unreviewed" | "in_review" | "reviewed" | "reopened"
      import_batch_status:
        | "uploaded"
        | "validating"
        | "processing"
        | "completed"
        | "partial"
        | "failed"
        | "archived"
      integration_provider: "ringba" | "retreaver" | "trackdrive" | "custom"
      integration_status: "connected" | "degraded" | "error" | "disconnected"
      organization_role: "owner" | "admin" | "reviewer" | "analyst" | "billing"
      source_kind: "csv" | "webhook" | "api" | "pixel"
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
      call_review_status: ["unreviewed", "in_review", "reviewed", "reopened"],
      import_batch_status: [
        "uploaded",
        "validating",
        "processing",
        "completed",
        "partial",
        "failed",
        "archived",
      ],
      integration_provider: ["ringba", "retreaver", "trackdrive", "custom"],
      integration_status: ["connected", "degraded", "error", "disconnected"],
      organization_role: ["owner", "admin", "reviewer", "analyst", "billing"],
      source_kind: ["csv", "webhook", "api", "pixel"],
    },
  },
} as const
