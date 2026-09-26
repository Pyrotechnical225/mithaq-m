export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

type SupabaseEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_PROJECT_ID?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
};

// Supabase publishable configuration is safe to ship in a browser bundle.
// Access to data remains protected by Auth and Row Level Security.
export const MITHAQ_SUPABASE_PUBLIC_CONFIG: SupabasePublicConfig = {
  url: "https://oxhpvawqmrdvkrlntswl.supabase.co",
  publishableKey: "sb_publishable_8N2amfA8K3pdIvq2fPBulw_yj3REw7J",
};

export function getSupabaseProjectRef(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Supabase URL must be an absolute URL");
  }

  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) {
    throw new Error("Supabase URL must use the canonical <project-ref>.supabase.co host");
  }
  return match[1].toLowerCase();
}

/** Prevent browser and server builds from silently targeting different projects. */
export function assertSupabaseEnvironment(environment: SupabaseEnvironment): string {
  const configuredRef = getSupabaseProjectRef(MITHAQ_SUPABASE_PUBLIC_CONFIG.url);
  const references = new Map<string, string>([["embedded public config", configuredRef]]);

  const addUrl = (label: string, value: string | undefined) => {
    if (value?.trim()) references.set(label, getSupabaseProjectRef(value.trim()));
  };
  const addProjectId = (label: string, value: string | undefined) => {
    if (value?.trim()) references.set(label, value.trim().toLowerCase());
  };

  addUrl("SUPABASE_URL", environment.SUPABASE_URL);
  addUrl("VITE_SUPABASE_URL", environment.VITE_SUPABASE_URL);
  addProjectId("SUPABASE_PROJECT_ID", environment.SUPABASE_PROJECT_ID);
  addProjectId("VITE_SUPABASE_PROJECT_ID", environment.VITE_SUPABASE_PROJECT_ID);

  const mismatches = Array.from(references.entries()).filter(([, ref]) => ref !== configuredRef);
  if (mismatches.length > 0) {
    const details = mismatches.map(([label, ref]) => `${label}=${ref}`).join(", ");
    throw new Error(
      `Supabase project mismatch: expected ${configuredRef}; received ${details}. Browser and server configuration must use the same project.`,
    );
  }

  return configuredRef;
}

function sameConfig(left: SupabasePublicConfig, right: SupabasePublicConfig) {
  return left.url === right.url && left.publishableKey === right.publishableKey;
}

export function getServerSupabasePublicConfigs(): SupabasePublicConfig[] {
  assertSupabaseEnvironment(process.env);
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
