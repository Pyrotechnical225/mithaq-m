import type { Database } from "@/integrations/supabase/types";
import type { EmailJob, EmailJobResult } from "./notification-dispatch";

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type JobRow = EmailJob & {
  notification_id: string | null;
  check_in_id: string | null;
  referral_id: string | null;
  imam_application_id: string | null;
  event_key: string;
  not_before: string;
  status: EmailJobResult | "processing";
  claim_token: string | null;
  claimed_at: string | null;
  ses_message_id: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};
export type MeetingCheckIn = {
  id: string;
  meetup_id: string;
  pairing_id: string;
  user_id: string;
  due_at: string;
  answered_at: string | null;
  outcome: string | null;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

/** Local migration types; keep the generated production schema untouched until applied. */
export type NotificationDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "meetups"> & {
      meetups: Table<
        Database["public"]["Tables"]["meetups"]["Row"] & { completed_at: string | null }
      >;
      email_notification_preferences: Table<{
        user_id: string;
        category: string;
        enabled: boolean;
        updated_at: string;
      }>;
      notification_email_jobs: Table<JobRow>;
      meeting_check_ins: Table<MeetingCheckIn>;
    };
    Functions: Database["public"]["Functions"] & {
      claim_notification_email: { Args: { p_claim_token: string }; Returns: JobRow[] };
      answer_meeting_check_in: {
        Args: { p_id: string; p_outcome: string; p_note: string | null };
        Returns: boolean;
      };
      complete_assigned_meeting: { Args: { p_id: string }; Returns: boolean };
    };
  };
};
