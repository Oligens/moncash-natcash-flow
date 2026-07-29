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
      apps: {
        Row: {
          amount_regex: string
          api_key: string
          created_at: string
          id: string
          moncash_number: string | null
          name: string
          name_regex: string
          natcash_number: string | null
          owner_id: string | null
          qr_image_url: string | null
          reference_regex: string
          relay_last_seen_at: string | null
          sender_whitelist: string[]
          slug: string
          strict_name_match: boolean
          updated_at: string
        }
        Insert: {
          amount_regex?: string
          api_key?: string
          created_at?: string
          id?: string
          moncash_number?: string | null
          name: string
          name_regex?: string
          natcash_number?: string | null
          owner_id?: string | null
          qr_image_url?: string | null
          reference_regex?: string
          relay_last_seen_at?: string | null
          sender_whitelist?: string[]
          slug: string
          strict_name_match?: boolean
          updated_at?: string
        }
        Update: {
          amount_regex?: string
          api_key?: string
          created_at?: string
          id?: string
          moncash_number?: string | null
          name?: string
          name_regex?: string
          natcash_number?: string | null
          owner_id?: string | null
          qr_image_url?: string | null
          reference_regex?: string
          relay_last_seen_at?: string | null
          sender_whitelist?: string[]
          slug?: string
          strict_name_match?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_invoices: {
        Row: {
          amount: number
          created_at: string
          developer_email: string | null
          developer_id: string
          due_date: string | null
          id: string
          period: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          developer_email?: string | null
          developer_id: string
          due_date?: string | null
          id?: string
          period?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          developer_email?: string | null
          developer_id?: string
          due_date?: string | null
          id?: string
          period?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          platform_name: string
          relay_apk_url: string
          saas_monthly_price: number
          saas_yearly_price: number
          support_email: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          id?: string
          platform_name?: string
          relay_apk_url?: string
          saas_monthly_price?: number
          saas_yearly_price?: number
          support_email?: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          id?: string
          platform_name?: string
          relay_apk_url?: string
          saas_monthly_price?: number
          saas_yearly_price?: number
          support_email?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      relay_logs: {
        Row: {
          app_id: string
          created_at: string
          detail: string | null
          id: string
          raw_content: string
          sender: string | null
          status: string
        }
        Insert: {
          app_id: string
          created_at?: string
          detail?: string | null
          id?: string
          raw_content: string
          sender?: string | null
          status?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          raw_content?: string
          sender?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "relay_logs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          amount_detected: number | null
          app_id: string | null
          id: string
          matched_subscription_id: string | null
          processed_at: string
          raw_content: string
          reason: string | null
          reference: string | null
          sender_name: string | null
          sender_phone: string | null
          status: string
        }
        Insert: {
          amount_detected?: number | null
          app_id?: string | null
          id?: string
          matched_subscription_id?: string | null
          processed_at?: string
          raw_content: string
          reason?: string | null
          reference?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          status?: string
        }
        Update: {
          amount_detected?: number | null
          app_id?: string | null
          id?: string
          matched_subscription_id?: string | null
          processed_at?: string
          raw_content?: string
          reason?: string | null
          reference?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_matched_subscription_id_fkey"
            columns: ["matched_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_name: string
          amount: number
          app_id: string
          created_at: string
          expires_at: string | null
          id: string
          plan_type: string
          provider: string
          reference: string | null
          status: string
          user_id: string
          user_phone: string | null
        }
        Insert: {
          account_name: string
          amount: number
          app_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_type?: string
          provider?: string
          reference?: string | null
          status?: string
          user_id: string
          user_phone?: string | null
        }
        Update: {
          account_name?: string
          amount?: number
          app_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_type?: string
          provider?: string
          reference?: string | null
          status?: string
          user_id?: string
          user_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_app: { Args: { _app_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
