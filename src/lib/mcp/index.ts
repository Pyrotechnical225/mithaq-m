import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { MITHAQ_SUPABASE_PUBLIC_CONFIG } from "@/integrations/supabase/public-config";
import getMyProfile from "./tools/get-my-profile";
import getMySurvey from "./tools/get-my-survey";
import saveMySurvey from "./tools/save-my-survey";
import getPrivacy from "./tools/get-privacy";
import updatePrivacy from "./tools/update-privacy";
import listMatches from "./tools/list-matches";
import listInterests from "./tools/list-interests";
import expressInterest from "./tools/express-interest";
import respondInterest from "./tools/respond-interest";

const configuredSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || MITHAQ_SUPABASE_PUBLIC_CONFIG.url;
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID || new URL(configuredSupabaseUrl).hostname.split(".")[0];

export default defineMcp({
  name: "mithaq-mcp",
  title: "Mithaq",
  version: "0.1.0",
  instructions:
    "Tools for the Mithaq halal marriage platform. Callers act as the signed-in Mithaq user: read/update their survey answers and privacy settings, view AI-generated matches, and manage interests.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMyProfile,
    getMySurvey,
    saveMySurvey,
    getPrivacy,
    updatePrivacy,
    listMatches,
    listInterests,
    expressInterest,
    respondInterest,
  ],
});
