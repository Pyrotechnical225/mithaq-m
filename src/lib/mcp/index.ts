import { auth, defineMcp } from "@lovable.dev/mcp-js";
import {
  assertSupabaseEnvironment,
  getSupabaseProjectRef,
  MITHAQ_SUPABASE_PUBLIC_CONFIG,
} from "@/integrations/supabase/public-config";
import getMyProfile from "./tools/get-my-profile";
import getMySurvey from "./tools/get-my-survey";
import saveMySurvey from "./tools/save-my-survey";
import getPrivacy from "./tools/get-privacy";
import updatePrivacy from "./tools/update-privacy";

const configuredSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || MITHAQ_SUPABASE_PUBLIC_CONFIG.url;
const projectRef = assertSupabaseEnvironment({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
});

if (getSupabaseProjectRef(configuredSupabaseUrl) !== projectRef) {
  throw new Error("MCP authentication issuer does not match the configured Supabase project");
}

export default defineMcp({
  name: "mithaq-mcp",
  title: "Mithaq",
  version: "0.1.0",
  instructions:
    "Tools for the Mithaq halal marriage platform. Callers act as the signed-in Mithaq user and can read or update their own survey answers and privacy settings. Compatibility working data and private introductions remain inside the imam-reviewed website flow.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, getMySurvey, saveMySurvey, getPrivacy, updatePrivacy],
});
