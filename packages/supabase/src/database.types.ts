export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      appliances: {
        Row: {
          id: string
          passport_id: string
          appliance_type: string
          make: string | null
          model_number: string | null
          model_canonical: string | null
          serial_number: string | null
          install_year: number | null
          photo_url: string | null
          notes: string | null
          recall_status: string | null
          recall_checked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          passport_id: string
          appliance_type: string
          make?: string | null
          model_number?: string | null
          model_canonical?: string | null
          serial_number?: string | null
          install_year?: number | null
          photo_url?: string | null
          notes?: string | null
          recall_status?: string | null
          recall_checked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          passport_id?: string
          appliance_type?: string
          make?: string | null
          model_number?: string | null
          model_canonical?: string | null
          serial_number?: string | null
          install_year?: number | null
          photo_url?: string | null
          notes?: string | null
          recall_status?: string | null
          recall_checked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appliances_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passports"
            referencedColumns: ["id"]
          }
        ]
      }
      corpus_chunks: {
        Row: {
          id: string
          document_id: string
          chunk_index: number
          content: string
          embedding: string | null
          token_count: number | null
          page_number: number | null
          section_title: string | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          chunk_index: number
          content: string
          embedding?: string | null
          token_count?: number | null
          page_number?: number | null
          section_title?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          chunk_index?: number
          content?: string
          embedding?: string | null
          token_count?: number | null
          page_number?: number | null
          section_title?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "corpus_documents"
            referencedColumns: ["id"]
          }
        ]
      }
      corpus_documents: {
        Row: {
          id: string
          make: string
          model_canonical: string
          model_variants: string[] | null
          appliance_type: string
          doc_type: string
          year_start: number | null
          year_end: number | null
          source_url: string | null
          source_slug: string | null
          license: string
          coverage_depth: string
          raw_file_path: string | null
          page_count: number | null
          quality_score: number | null
          ingestion_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          make: string
          model_canonical: string
          model_variants?: string[] | null
          appliance_type: string
          doc_type: string
          year_start?: number | null
          year_end?: number | null
          source_url?: string | null
          source_slug?: string | null
          license: string
          coverage_depth: string
          raw_file_path?: string | null
          page_count?: number | null
          quality_score?: number | null
          ingestion_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          make?: string
          model_canonical?: string
          model_variants?: string[] | null
          appliance_type?: string
          doc_type?: string
          year_start?: number | null
          year_end?: number | null
          source_url?: string | null
          source_slug?: string | null
          license?: string
          coverage_depth?: string
          raw_file_path?: string | null
          page_count?: number | null
          quality_score?: number | null
          ingestion_date?: string | null
          created_at?: string
        }
        Relationships: []
      }
      cpsc_recalls: {
        Row: {
          id: string
          recall_number: string
          title: string
          description: string | null
          hazard: string | null
          remedy: string | null
          units: number | null
          recall_date: string | null
          url: string | null
          makes: string[] | null
          model_numbers: string[] | null
          appliance_types: string[] | null
          raw: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          recall_number: string
          title: string
          description?: string | null
          hazard?: string | null
          remedy?: string | null
          units?: number | null
          recall_date?: string | null
          url?: string | null
          makes?: string[] | null
          model_numbers?: string[] | null
          appliance_types?: string[] | null
          raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          recall_number?: string
          title?: string
          description?: string | null
          hazard?: string | null
          remedy?: string | null
          units?: number | null
          recall_date?: string | null
          url?: string | null
          makes?: string[] | null
          model_numbers?: string[] | null
          appliance_types?: string[] | null
          raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      diagnostic_sessions: {
        Row: {
          id: string
          user_id: string
          passport_id: string | null
          appliance_id: string | null
          symptom: string
          summary: string | null
          severity: string | null
          steps: Json | null
          escalate_message: string | null
          disclaimer: string | null
          escalated_at: string | null
          escalated_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          passport_id?: string | null
          appliance_id?: string | null
          symptom: string
          summary?: string | null
          severity?: string | null
          steps?: Json | null
          escalate_message?: string | null
          disclaimer?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          passport_id?: string | null
          appliance_id?: string | null
          symptom?: string
          summary?: string | null
          severity?: string | null
          steps?: Json | null
          escalate_message?: string | null
          disclaimer?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_sessions_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_sessions_appliance_id_fkey"
            columns: ["appliance_id"]
            isOneToOne: false
            referencedRelation: "appliances"
            referencedColumns: ["id"]
          }
        ]
      }
      model_registry: {
        Row: {
          id: string
          make: string
          model_number: string
          model_canonical: string | null
          appliance_type: string | null
          year_introduced: number | null
          year_discontinued: number | null
          energy_star: boolean | null
          data_source: string | null
          raw: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          make: string
          model_number: string
          model_canonical?: string | null
          appliance_type?: string | null
          year_introduced?: number | null
          year_discontinued?: number | null
          energy_star?: boolean | null
          data_source?: string | null
          raw?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          make?: string
          model_number?: string
          model_canonical?: string | null
          appliance_type?: string | null
          year_introduced?: number | null
          year_discontinued?: number | null
          energy_star?: boolean | null
          data_source?: string | null
          raw?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      passport_appliances: {
        Row: {
          passport_id: string
          appliance_id: string
          display_order: number | null
          created_at: string
        }
        Insert: {
          passport_id: string
          appliance_id: string
          display_order?: number | null
          created_at?: string
        }
        Update: {
          passport_id?: string
          appliance_id?: string
          display_order?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_appliances_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_appliances_appliance_id_fkey"
            columns: ["appliance_id"]
            isOneToOne: false
            referencedRelation: "appliances"
            referencedColumns: ["id"]
          }
        ]
      }
      passport_invites: {
        Row: {
          id: string
          passport_id: string
          token: string
          invited_email: string | null
          invited_phone: string | null
          delivery_method: string
          sent_at: string | null
          claimed_by: string | null
          activated_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          passport_id: string
          token?: string
          invited_email?: string | null
          invited_phone?: string | null
          delivery_method: string
          sent_at?: string | null
          claimed_by?: string | null
          activated_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          passport_id?: string
          token?: string
          invited_email?: string | null
          invited_phone?: string | null
          delivery_method?: string
          sent_at?: string | null
          claimed_by?: string | null
          activated_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_invites_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "passports"
            referencedColumns: ["id"]
          }
        ]
      }
      passports: {
        Row: {
          id: string
          property_id: string
          broker_id: string
          status: string
          qr_code_url: string | null
          public_token: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          property_id: string
          broker_id: string
          status?: string
          qr_code_url?: string | null
          public_token?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          property_id?: string
          broker_id?: string
          status?: string
          qr_code_url?: string | null
          public_token?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "passports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passports_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          role: string
          full_name: string | null
          phone: string | null
          brokerage_name: string | null
          license_number: string | null
          agent_photo_url: string | null
          subscription_status: string | null
          subscription_expires_at: string | null
          onboarded_via: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: string
          full_name?: string | null
          phone?: string | null
          brokerage_name?: string | null
          license_number?: string | null
          agent_photo_url?: string | null
          subscription_status?: string | null
          subscription_expires_at?: string | null
          onboarded_via?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: string
          full_name?: string | null
          phone?: string | null
          brokerage_name?: string | null
          license_number?: string | null
          agent_photo_url?: string | null
          subscription_status?: string | null
          subscription_expires_at?: string | null
          onboarded_via?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          id: string
          broker_id: string
          address_line1: string
          address_line2: string | null
          city: string
          state: string
          zip: string
          country: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          broker_id: string
          address_line1: string
          address_line2?: string | null
          city: string
          state: string
          zip: string
          country?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          broker_id?: string
          address_line1?: string
          address_line2?: string | null
          city?: string
          state?: string
          zip?: string
          country?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
