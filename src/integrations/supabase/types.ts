export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          details: Json;
          id: string;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [];
      };
      imam_accounts: {
        Row: {
          active: boolean;
          created_at: string;
          imam_id: string;
          radius_km: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          imam_id: string;
          radius_km?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          imam_id?: string;
          radius_km?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "imam_accounts_imam_id_fkey";
            columns: ["imam_id"];
            isOneToOne: false;
            referencedRelation: "imams";
            referencedColumns: ["id"];
          },
        ];
      };
      imam_applications: {
        Row: {
          admin_notes: string | null;
          city: string;
          created_at: string;
          credentials: string | null;
          email: string;
          id: string;
          imam_id: string | null;
          languages: string[];
          message: string | null;
          mosque: string | null;
          name: string;
          phone: string | null;
          postcode: string | null;
          reviewed_at: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          admin_notes?: string | null;
          city: string;
          created_at?: string;
          credentials?: string | null;
          email: string;
          id?: string;
          imam_id?: string | null;
          languages?: string[];
          message?: string | null;
          mosque?: string | null;
          name: string;
          phone?: string | null;
          postcode?: string | null;
          reviewed_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          city?: string;
          created_at?: string;
          credentials?: string | null;
          email?: string;
          id?: string;
          imam_id?: string | null;
          languages?: string[];
          message?: string | null;
          mosque?: string | null;
          name?: string;
          phone?: string | null;
          postcode?: string | null;
          reviewed_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "imam_applications_imam_id_fkey";
            columns: ["imam_id"];
            isOneToOne: false;
            referencedRelation: "imams";
            referencedColumns: ["id"];
          },
        ];
      };
      imam_referrals: {
        Row: {
          admin_notes: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          invitation_expires_at: string | null;
          invitation_token_hash: string | null;
          referred_email: string;
          referred_name: string;
          referrer_imam_id: string;
          referrer_user_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          invitation_expires_at?: string | null;
          invitation_token_hash?: string | null;
          referred_email: string;
          referred_name: string;
          referrer_imam_id: string;
          referrer_user_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          invitation_expires_at?: string | null;
          invitation_token_hash?: string | null;
          referred_email?: string;
          referred_name?: string;
          referrer_imam_id?: string;
          referrer_user_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "imam_referrals_referrer_imam_id_fkey";
            columns: ["referrer_imam_id"];
            isOneToOne: false;
            referencedRelation: "imams";
            referencedColumns: ["id"];
          },
        ];
      };
      imams: {
        Row: {
          city: string;
          created_at: string;
          email: string | null;
          id: string;
          languages: string[];
          lat: number | null;
          lng: number | null;
          mosque: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          postcode: string | null;
          title: string | null;
          updated_at: string;
          verification_status: string;
          verified_at: string | null;
          verified_by: string | null;
          website: string | null;
        };
        Insert: {
          city: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          languages?: string[];
          lat?: number | null;
          lng?: number | null;
          mosque?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          postcode?: string | null;
          title?: string | null;
          updated_at?: string;
          verification_status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          website?: string | null;
        };
        Update: {
          city?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          languages?: string[];
          lat?: number | null;
          lng?: number | null;
          mosque?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          postcode?: string | null;
          title?: string | null;
          updated_at?: string;
          verification_status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      interests: {
        Row: {
          created_at: string;
          from_user: string;
          id: string;
          status: string;
          to_user: string;
        };
        Insert: {
          created_at?: string;
          from_user: string;
          id?: string;
          status?: string;
          to_user: string;
        };
        Update: {
          created_at?: string;
          from_user?: string;
          id?: string;
          status?: string;
          to_user?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          created_at: string;
          id: string;
          results: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          results?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          results?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      meeting_package_purchases: {
        Row: {
          amount_pence: number;
          created_at: string;
          currency: string;
          id: string;
          meeting_count: number;
          package_id: string;
          paid_at: string;
          pairing_id: string;
          payment_status: string;
          stripe_payment_intent_id: string | null;
          stripe_session_id: string;
          user_id: string;
        };
        Insert: {
          amount_pence: number;
          created_at?: string;
          currency?: string;
          id?: string;
          meeting_count: number;
          package_id: string;
          paid_at?: string;
          pairing_id: string;
          payment_status?: string;
          stripe_payment_intent_id?: string | null;
          stripe_session_id: string;
          user_id: string;
        };
        Update: {
          amount_pence?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          meeting_count?: number;
          package_id?: string;
          paid_at?: string;
          pairing_id?: string;
          payment_status?: string;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_package_purchases_pairing_id_fkey";
            columns: ["pairing_id"];
            isOneToOne: false;
            referencedRelation: "pairings";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_checkout_attempts: {
        Row: {
          amount_pence: number;
          completed_at: string | null;
          created_at: string;
          currency: string;
          id: string;
          last_error: string | null;
          meeting_count: number;
          package_id: string;
          pairing_id: string;
          status: string;
          stripe_session_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_pence: number;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          last_error?: string | null;
          meeting_count: number;
          package_id: string;
          pairing_id: string;
          status?: string;
          stripe_session_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_pence?: number;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          last_error?: string | null;
          meeting_count?: number;
          package_id?: string;
          pairing_id?: string;
          status?: string;
          stripe_session_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_checkout_attempts_pairing_id_fkey";
            columns: ["pairing_id"];
            isOneToOne: false;
            referencedRelation: "pairings";
            referencedColumns: ["id"];
          },
        ];
      };
      meetups: {
        Row: {
          address: string | null;
          created_at: string;
          id: string;
          imam_id: string | null;
          note: string | null;
          pairing_id: string;
          response_a: string;
          response_b: string;
          scheduled_at: string;
          status: string;
          updated_at: string;
          venue: string;
          wali_required: boolean;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          id?: string;
          imam_id?: string | null;
          note?: string | null;
          pairing_id: string;
          response_a?: string;
          response_b?: string;
          scheduled_at: string;
          status?: string;
          updated_at?: string;
          venue: string;
          wali_required?: boolean;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          id?: string;
          imam_id?: string | null;
          note?: string | null;
          pairing_id?: string;
          response_a?: string;
          response_b?: string;
          scheduled_at?: string;
          status?: string;
          updated_at?: string;
          venue?: string;
          wali_required?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "meetups_imam_id_fkey";
            columns: ["imam_id"];
            isOneToOne: false;
            referencedRelation: "imams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meetups_pairing_id_fkey";
            columns: ["pairing_id"];
            isOneToOne: false;
            referencedRelation: "pairings";
            referencedColumns: ["id"];
          },
        ];
      };
      member_blocks: {
        Row: {
          block_id: string;
          blocked_user_id: string;
          blocker_user_id: string;
          created_at: string;
          reason: string | null;
        };
        Insert: {
          block_id?: string;
          blocked_user_id: string;
          blocker_user_id: string;
          created_at?: string;
          reason?: string | null;
        };
        Update: {
          block_id?: string;
          blocked_user_id?: string;
          blocker_user_id?: string;
          created_at?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      member_consents: {
        Row: {
          adult_confirmed_at: string | null;
          compatibility_processing_consent_at: string | null;
          compatibility_processing_withdrawn_at: string | null;
          created_at: string;
          privacy_notice_accepted_at: string | null;
          privacy_notice_version: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          adult_confirmed_at?: string | null;
          compatibility_processing_consent_at?: string | null;
          compatibility_processing_withdrawn_at?: string | null;
          created_at?: string;
          privacy_notice_accepted_at?: string | null;
          privacy_notice_version?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          adult_confirmed_at?: string | null;
          compatibility_processing_consent_at?: string | null;
          compatibility_processing_withdrawn_at?: string | null;
          created_at?: string;
          privacy_notice_accepted_at?: string | null;
          privacy_notice_version?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      member_reports: {
        Row: {
          category: string;
          created_at: string;
          details: string;
          id: string;
          pairing_id: string | null;
          reported_user_id: string;
          reporter_user_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          details: string;
          id?: string;
          pairing_id?: string | null;
          reported_user_id: string;
          reporter_user_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          details?: string;
          id?: string;
          pairing_id?: string | null;
          reported_user_id?: string;
          reporter_user_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_reports_pairing_id_fkey";
            columns: ["pairing_id"];
            isOneToOne: false;
            referencedRelation: "pairings";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          pairing_id: string | null;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          pairing_id?: string | null;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          pairing_id?: string | null;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_pairing_id_fkey";
            columns: ["pairing_id"];
            isOneToOne: false;
            referencedRelation: "pairings";
            referencedColumns: ["id"];
          },
        ];
      };
      pairing_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          pairing_id: string;
          sender_id: string;
          sender_role: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          pairing_id: string;
          sender_id: string;
          sender_role?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          pairing_id?: string;
          sender_id?: string;
          sender_role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pairing_messages_pairing_id_fkey";
            columns: ["pairing_id"];
            isOneToOne: false;
            referencedRelation: "pairings";
            referencedColumns: ["id"];
          },
        ];
      };
      pairings: {
        Row: {
          compatibility_score: number | null;
          compatibility_summary: Json;
          created_at: string;
          decided_at: string | null;
          decision_note: string | null;
          id: string;
          imam_id: string | null;
          meeting_preference_a: string | null;
          meeting_preference_b: string | null;
          member_a_response: string;
          member_b_response: string;
          payment_a_status: string;
          payment_b_status: string;
          payment_session_a: string | null;
          payment_session_b: string | null;
          status: string;
          updated_at: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          compatibility_score?: number | null;
          compatibility_summary?: Json;
          created_at?: string;
          decided_at?: string | null;
          decision_note?: string | null;
          id?: string;
          imam_id?: string | null;
          meeting_preference_a?: string | null;
          meeting_preference_b?: string | null;
          member_a_response?: string;
          member_b_response?: string;
          payment_a_status?: string;
          payment_b_status?: string;
          payment_session_a?: string | null;
          payment_session_b?: string | null;
          status?: string;
          updated_at?: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          compatibility_score?: number | null;
          compatibility_summary?: Json;
          created_at?: string;
          decided_at?: string | null;
          decision_note?: string | null;
          id?: string;
          imam_id?: string | null;
          meeting_preference_a?: string | null;
          meeting_preference_b?: string | null;
          member_a_response?: string;
          member_b_response?: string;
          payment_a_status?: string;
          payment_b_status?: string;
          payment_session_a?: string | null;
          payment_session_b?: string | null;
          status?: string;
          updated_at?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pairings_imam_id_fkey";
            columns: ["imam_id"];
            isOneToOne: false;
            referencedRelation: "imams";
            referencedColumns: ["id"];
          },
        ];
      };
      privacy_settings: {
        Row: {
          reveal_contact_on_mutual: boolean;
          show_free_text: boolean;
          show_location: boolean;
          show_occupation: boolean;
          updated_at: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          reveal_contact_on_mutual?: boolean;
          show_free_text?: boolean;
          show_location?: boolean;
          show_occupation?: boolean;
          updated_at?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          reveal_contact_on_mutual?: boolean;
          show_free_text?: boolean;
          show_location?: boolean;
          show_occupation?: boolean;
          updated_at?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          contact_email: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          location_lat: number | null;
          location_lng: number | null;
          uk_city: string | null;
          uk_postcode: string | null;
          updated_at: string;
        };
        Insert: {
          contact_email?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          location_lat?: number | null;
          location_lng?: number | null;
          uk_city?: string | null;
          uk_postcode?: string | null;
          updated_at?: string;
        };
        Update: {
          contact_email?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          uk_city?: string | null;
          uk_postcode?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          attempts: number;
          id: string;
          last_attempt_at: string;
          last_error: string | null;
          processed_at: string | null;
          status: string;
          type: string;
        };
        Insert: {
          attempts?: number;
          id: string;
          last_attempt_at?: string;
          last_error?: string | null;
          processed_at?: string | null;
          status?: string;
          type: string;
        };
        Update: {
          attempts?: number;
          id?: string;
          last_attempt_at?: string;
          last_error?: string | null;
          processed_at?: string | null;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          last_payment_status: string | null;
          plan: string;
          provider: string | null;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          status: string;
          stripe_updated_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          last_payment_status?: string | null;
          plan?: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          status?: string;
          stripe_updated_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          last_payment_status?: string | null;
          plan?: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          status?: string;
          stripe_updated_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      survey_answers: {
        Row: {
          answers: Json;
          completed: boolean;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          answers?: Json;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answers?: Json;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_active_membership: { Args: { _user_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_imam: { Args: { _user_id: string }; Returns: boolean };
      mithaq_survey_is_complete: { Args: { candidate: Json }; Returns: boolean };
      my_imam_id: { Args: { _user_id: string }; Returns: string };
      respond_to_introduction: {
        Args: { _accept: boolean; _pairing_id: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
