export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      challenges: Table<
        { id: number; name: string; start_date: string; end_date: string; default_fee: number; default_penalty: number; is_active: boolean; created_at: string; updated_at: string },
        { id?: number; name: string; start_date: string; end_date: string; default_fee?: number; default_penalty?: number; is_active?: boolean; created_at?: string; updated_at?: string }
      >;
      operators: Table<
        { id: number; name: string; is_active: boolean; created_at: string },
        { id?: number; name: string; is_active?: boolean; created_at?: string }
      >;
      participants: Table<
        { id: number; challenge_id: number; name: string; joined_at: string; left_at: string | null; paid_amount: number; is_active: boolean; created_at: string; updated_at: string },
        { id?: number; challenge_id: number; name: string; joined_at: string; left_at?: string | null; paid_amount?: number; is_active?: boolean; created_at?: string; updated_at?: string }
      >;
      submissions: Table<
        { id: number; challenge_id: number; participant_id: number; title: string | null; url: string; normalized_url: string; description: string | null; edit_password_hash: string; submitted_at: string; is_featured: boolean; created_at: string; updated_at: string },
        { id?: number; challenge_id: number; participant_id: number; title?: string | null; url: string; normalized_url: string; description?: string | null; edit_password_hash: string; submitted_at?: string; is_featured?: boolean; created_at?: string; updated_at?: string },
        { title?: string | null; url?: string; normalized_url?: string; description?: string | null; is_featured?: boolean; updated_at?: string }
      >;
      exemptions: Table<
        { id: number; challenge_id: number; participant_id: number; exemption_date: string; reason: string; operator_id: number; created_at: string },
        { id?: number; challenge_id: number; participant_id: number; exemption_date: string; reason: string; operator_id: number; created_at?: string }
      >;
      excluded_dates: Table<
        { id: number; challenge_id: number; excluded_date: string; reason: string; source: "holiday" | "admin"; operator_id: number | null; created_at: string },
        { id?: number; challenge_id: number; excluded_date: string; reason: string; source: "holiday" | "admin"; operator_id?: number | null; created_at?: string }
      >;
      penalty_rates: Table<
        { id: number; challenge_id: number; amount: number; effective_from: string; operator_id: number | null; created_at: string },
        { id?: number; challenge_id: number; amount: number; effective_from: string; operator_id?: number | null; created_at?: string }
      >;
      notices: Table<
        { id: number; challenge_id: number; title: string; content: string; is_pinned: boolean; operator_id: number; created_at: string; updated_at: string },
        { id?: number; challenge_id: number; title: string; content: string; is_pinned?: boolean; operator_id: number; created_at?: string; updated_at?: string }
      >;
      audit_logs: Table<
        { id: number; challenge_id: number; operator_id: number; action: string; entity_type: string; entity_id: string | null; before_data: Json | null; after_data: Json | null; created_at: string },
        { id?: number; challenge_id: number; operator_id: number; action: string; entity_type: string; entity_id?: string | null; before_data?: Json | null; after_data?: Json | null; created_at?: string }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      activate_challenge: {
        Args: { p_challenge_id: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
