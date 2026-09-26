import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useEffect, useState } from "react";

function shouldEnableVercelObservability() {
  if (import.meta.env.VITE_ENABLE_VERCEL_OBSERVABILITY === "true") return true;
  return window.location.hostname.endsWith(".vercel.app");
}

/** Load Vercel-only telemetry without sending Sites or local traffic to dead endpoints. */
export function VercelObservability() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(shouldEnableVercelObservability());
  }, []);

  if (!enabled) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
