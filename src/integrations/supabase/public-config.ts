export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

// Supabase publishable configuration is safe to ship in a browser bundle.
// Access to data remains protected by Auth and Row Level Security.
export const MITHAQ_SUPABASE_PUBLIC_CONFIG: SupabasePublicConfig = {
  url: "https://ezczqpvlsnrgpdhqzcpi.supabase.co",
  publishableKey: "sb_publishable_vXDkC_z2fFUDty3ACexSwg_9pB7ZcfA",
};

function sameConfig(left: SupabasePublicConfig, right: SupabasePublicConfig) {
  return left.url === right.url && left.publishableKey === right.publishableKey;
}

export function getServerSupabasePublicConfigs(): SupabasePublicConfig[] {
  const candidates: SupabasePublicConfig[] = [];

  const addCandidate = (url: string | undefined, publishableKey: string | undefined) => {
    const normalizedUrl = url?.trim().replace(/\/$/, "");
    const normalizedKey = publishableKey?.trim();
    if (!normalizedUrl || !normalizedKey) return;

    const candidate = { url: normalizedUrl, publishableKey: normalizedKey };
    if (!candidates.some((current) => sameConfig(current, candidate))) {
      candidates.push(candidate);
    }
  };

  addCandidate(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  addCandidate(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  addCandidate(MITHAQ_SUPABASE_PUBLIC_CONFIG.url, MITHAQ_SUPABASE_PUBLIC_CONFIG.publishableKey);

  return candidates;
}
