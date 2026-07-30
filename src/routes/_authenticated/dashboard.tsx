import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAnswers } from "@/lib/survey.functions";
import { getMyPrivacy } from "@/lib/privacy.functions";
import {
  expressInterest,
  generateMatches,
  getLatestMatches,
  listInterests,
  respondInterest,
} from "@/lib/matches.functions";
import { getMyLocation, listImams, saveMyLocation, UK_CITIES_FOR_UI } from "@/lib/imams.functions";
import { haversineKm, kmToMiles } from "@/lib/geo";
import UkImamMap, { type ImamMapPoint } from "@/components/UkImamMap";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Mithaq dashboard" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type MatchRow = {
  match_user_id: string;
  score: number;
  strengths: string;
  considerations: string;
  age: string | null;
  location: string | null;
  practice_level: string | null;
  madhab: string | null;
  timeline: string | null;
};

function Dashboard() {
  const navigate = useNavigate();
  const fetchAnswers = useServerFn(getMyAnswers);
  const fetchPrivacy = useServerFn(getMyPrivacy);
  const fetchMatches = useServerFn(getLatestMatches);
  const runMatch = useServerFn(generateMatches);
  const sendInterest = useServerFn(expressInterest);
  const fetchInterests = useServerFn(listInterests);
  const reply = useServerFn(respondInterest);
  const fetchLocation = useServerFn(getMyLocation);
  const saveLocation = useServerFn(saveMyLocation);
  const fetchImams = useServerFn(listImams);

  const [email, setEmail] = useState<string>("");
  const [completed, setCompleted] = useState(false);
  const [visibility, setVisibility] = useState<string>("hidden");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [matchedAt, setMatchedAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState<Awaited<ReturnType<typeof listInterests>> | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // Location & imams
  const [locCity, setLocCity] = useState<string>("");
  const [locPostcode, setLocPostcode] = useState<string>("");
  const [locLat, setLocLat] = useState<number | null>(null);
  const [locLng, setLocLng] = useState<number | null>(null);
  const [locSaving, setLocSaving] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [imams, setImams] = useState<Awaited<ReturnType<typeof listImams>> | null>(null);
  const [imamCityFilter, setImamCityFilter] = useState<string>("all");
  const [imamRadius, setImamRadius] = useState<number>(0); // 0 = any (km)

  // Wali/parent confirmation before viewing matches. Persisted per browser.
  const [waliConfirmed, setWaliConfirmed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setWaliConfirmed(window.localStorage.getItem("mithaq:waliConfirmed") === "1");
    }
  }, []);
  const confirmWali = () => {
    setWaliConfirmed(true);
    if (typeof window !== "undefined") window.localStorage.setItem("mithaq:waliConfirmed", "1");
  };
  const resetWali = () => {
    setWaliConfirmed(false);
    if (typeof window !== "undefined") window.localStorage.removeItem("mithaq:waliConfirmed");
  };


  const loadAll = () => {
    Promise.all([
      fetchAnswers(), fetchPrivacy(), fetchMatches(), fetchInterests(),
      fetchLocation(), fetchImams(),
    ]).then(
      ([a, p, m, i, loc, im]) => {
        setCompleted(!!a?.completed);
        setVisibility(p?.visibility ?? "hidden");
        const results = (m?.results as { matches: MatchRow[] } | undefined)?.matches ?? null;
        setMatches(results);
        setMatchedAt(m?.created_at ?? null);
        setInterests(i);
        setSentIds(new Set(i.sent.map((s) => s.to_user)));
        setLocCity(loc?.uk_city ?? "");
        setLocPostcode(loc?.uk_postcode ?? "");
        setLocLat(loc?.location_lat ?? null);
        setLocLng(loc?.location_lng ?? null);
        setImams(im);
      },
    );
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const runMatching = async () => {
    setError(null);
    setRunning(true);
    try {
      const saved = await runMatch();
      const results = (saved?.results as { matches: MatchRow[] } | undefined)?.matches ?? [];
      setMatches(results);
      setMatchedAt(saved?.created_at ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate matches");
    } finally {
      setRunning(false);
    }
  };

  const saveLoc = async () => {
    setLocSaving(true);
    setLocMsg(null);
    try {
      const r = await saveLocation({ data: { uk_city: locCity || null, uk_postcode: locPostcode || null } });
      setLocMsg(r.matched_city ? `Saved. Nearby imams sorted by distance from ${r.matched_city}.` : "Saved.");
      const loc = await fetchLocation();
      setLocLat(loc?.location_lat ?? null);
      setLocLng(loc?.location_lng ?? null);
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLocSaving(false);
    }
  };

  const rankedImams = useMemo(() => {
    if (!imams) return [];
    const withDist = imams.map((im) => {
      const distKm = locLat != null && locLng != null && im.lat != null && im.lng != null
        ? haversineKm(locLat, locLng, im.lat, im.lng)
        : null;
      return { ...im, distKm };
    });
    const filtered = withDist.filter((im) => {
      if (imamCityFilter !== "all" && im.city !== imamCityFilter) return false;
      if (imamRadius > 0 && im.distKm != null && im.distKm > imamRadius) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (a.distKm != null && b.distKm != null) return a.distKm - b.distKm;
      if (a.distKm != null) return -1;
      if (b.distKm != null) return 1;
      return a.city.localeCompare(b.city);
    });
    return filtered;
  }, [imams, locLat, locLng, imamCityFilter, imamRadius]);

  const availableImamCities = useMemo(() => {
    const s = new Set<string>();
    (imams ?? []).forEach((im) => s.add(im.city));
    return Array.from(s).sort();
  }, [imams]);

  const canMatch = completed && visibility === "discoverable";



  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-arabic text-2xl text-primary">م</span>
            <span className="font-display text-lg text-foreground">Mithaq</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/settings" className="text-muted-foreground hover:text-foreground">
              Privacy & settings
            </Link>
            <span className="text-muted-foreground">{email}</span>
            <button
              onClick={signOut}
              className="rounded-full border border-border px-3 py-1 hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        {/* Status card */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl text-foreground">As-salamu alaykum</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete your survey and set your profile to Discoverable to begin matching.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/survey"
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {completed ? "Edit my answers" : "Complete survey"}
              </Link>
              <Link
                to="/settings"
                className="rounded-full border border-border px-5 py-2 text-sm hover:bg-accent"
              >
                Privacy settings
              </Link>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <Badge label="Survey" value={completed ? "Completed" : "In progress"} ok={completed} />
            <Badge
              label="Visibility"
              value={visibility}
              ok={visibility === "discoverable"}
            />
          </div>
        </section>

        {/* Matches */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl text-foreground">Your matches</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ranked by our AI matchmaker across deen, values, and life goals.
                {matchedAt && (
                  <span> Last generated {new Date(matchedAt).toLocaleString()}.</span>
                )}
              </p>
            </div>
            <button
              disabled={!canMatch || running}
              onClick={runMatching}
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {running ? "Finding matches…" : matches ? "Refresh matches" : "Find my matches"}
            </button>
          </div>




          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
            <p className="font-medium">Please review these matches with your wali or parent.</p>
            <p className="mt-1 text-muted-foreground">
              Mithaq encourages family involvement from the very first step. Sit down with a parent
              or wali (guardian) and go through the suggestions together before expressing interest —
              their guidance is part of the halal way.
            </p>
            {!waliConfirmed ? (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-input"
                  onChange={(e) => e.target.checked && confirmWali()}
                />
                <span>
                  I confirm my wali or parent is with me (or has agreed) to review these matches
                  together.
                </span>
              </label>
            ) : (
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-primary">✓ Wali / parent confirmed for this session.</span>
                <button onClick={resetWali} className="text-muted-foreground underline hover:text-foreground">
                  Undo
                </button>
              </div>
            )}
          </div>

          {!canMatch && (
            <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              {completed
                ? "Set your visibility to Discoverable in Privacy settings to enable matching."
                : "Finish the survey to enable matching."}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {!waliConfirmed ? (
            <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Confirm your wali or parent is reviewing with you to reveal your suitable matches.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {matches?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No compatible profiles yet. Check back as more people join.
                </p>
              )}
              {matches?.map((m) => (
              <div key={m.match_user_id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {m.age && <span className="mr-3">Age {m.age}</span>}
                    {m.location && <span className="mr-3">{m.location}</span>}
                    {m.madhab && <span className="mr-3">{m.madhab}</span>}
                    {m.practice_level && <span>{m.practice_level}</span>}
                  </div>
                  <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    {Math.round(m.score)}% match
                  </div>
                </div>
                <p className="mt-3 text-sm text-foreground">
                  <span className="font-medium">Strengths — </span>{m.strengths}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Consider — </span>{m.considerations}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    disabled={sentIds.has(m.match_user_id)}
                    onClick={async () => {
                      await sendInterest({ data: { to_user: m.match_user_id } });
                      setSentIds((s) => new Set(s).add(m.match_user_id));
                      fetchInterests().then(setInterests);
                    }}
                    className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sentIds.has(m.match_user_id) ? "Interest sent" : "Express interest"}
                  </button>
                </div>
              </div>
            ))}
            </div>
          )}

        </section>

        {/* Location */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl text-foreground">Your location in the UK</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set your city so we can suggest imams close to you for the nikah and guidance.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">City</span>
              <select value={locCity} onChange={(e) => setLocCity(e.target.value)} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select…</option>
                {UK_CITIES_FOR_UI.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Postcode (optional)</span>
              <input value={locPostcode} onChange={(e) => setLocPostcode(e.target.value)} placeholder="e.g. B1 1AA" className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <div className="flex items-end">
              <button disabled={locSaving || !locCity} onClick={saveLoc} className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {locSaving ? "Saving…" : "Save location"}
              </button>
            </div>
          </div>
          {locMsg && <p className="mt-2 text-xs text-muted-foreground">{locMsg}</p>}
        </section>

        {/* Imams near you */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl text-foreground">Imams near you</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {locLat != null
                  ? "Sorted by distance from your saved location."
                  : "Save your location above to sort by distance."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={imamCityFilter} onChange={(e) => setImamCityFilter(e.target.value)} className="rounded-full border border-input bg-background px-3 py-1.5 text-xs">
                <option value="all">All cities</option>
                {availableImamCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={imamRadius} onChange={(e) => setImamRadius(Number(e.target.value))} className="rounded-full border border-input bg-background px-3 py-1.5 text-xs" disabled={locLat == null}>
                <option value={0}>Any distance</option>
                <option value={15}>Within 15 km</option>
                <option value={40}>Within 40 km</option>
                <option value={80}>Within 80 km</option>
                <option value={160}>Within 160 km</option>
              </select>
            </div>
          </div>

          {/* Map of UK with imam pins */}
          <div className="mt-4">
            <UkImamMap
              points={rankedImams
                .filter((im): im is typeof im & { lat: number; lng: number } => im.lat != null && im.lng != null)
                .map<ImamMapPoint>((im) => ({
                  id: im.id,
                  name: im.name,
                  city: im.city,
                  mosque: im.mosque,
                  lat: im.lat as number,
                  lng: im.lng as number,
                  distKm: im.distKm ?? null,
                }))}
              user={locLat != null && locLng != null ? { lat: locLat, lng: locLng } : null}
            />
          </div>

          <div className="mt-4 space-y-3">
            {rankedImams.length === 0 && (
              <p className="text-sm text-muted-foreground">No imams match your filters yet.</p>
            )}
            {rankedImams.map((im) => (
              <div key={im.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-foreground font-medium">{im.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {im.title}{im.mosque ? ` · ${im.mosque}` : ""} · {im.city}{im.postcode ? `, ${im.postcode}` : ""}
                    </div>
                  </div>
                  {im.distKm != null && (
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {im.distKm.toFixed(1)} km <span className="opacity-60">· {kmToMiles(im.distKm).toFixed(1)} mi</span>
                    </div>
                  )}
                </div>
                {(im.languages ?? []).length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">Languages: {(im.languages ?? []).join(", ")}</div>
                )}
                {im.notes && <p className="mt-2 text-sm text-foreground">{im.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {im.phone && <a href={`tel:${im.phone}`} className="text-primary hover:underline">{im.phone}</a>}
                  {im.email && <a href={`mailto:${im.email}`} className="text-primary hover:underline">{im.email}</a>}
                  {im.website && <a href={im.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">Website</a>}
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* Interests */}
        {interests && (interests.received.length > 0 || interests.sent.length > 0) && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
            <h2 className="text-xl text-foreground">Interests</h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Received</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {interests.received.length === 0 && (
                    <li className="text-muted-foreground">Nothing yet.</li>
                  )}
                  {interests.received.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <div>Someone expressed interest</div>
                        <div className="text-xs text-muted-foreground">{r.status}</div>
                        {r.status === "accepted" && interests.contacts[r.from_user] && (
                          <div className="mt-1 text-xs text-primary">
                            {interests.contacts[r.from_user].contact_email}
                          </div>
                        )}
                      </div>
                      {r.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              await reply({ data: { interest_id: r.id, accept: true } });
                              loadAll();
                            }}
                            className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                          >
                            Accept
                          </button>
                          <button
                            onClick={async () => {
                              await reply({ data: { interest_id: r.id, accept: false } });
                              loadAll();
                            }}
                            className="rounded-full border border-border px-3 py-1 text-xs"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Sent</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {interests.sent.length === 0 && (
                    <li className="text-muted-foreground">Nothing yet.</li>
                  )}
                  {interests.sent.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <div>Interest sent</div>
                        <div className="text-xs text-muted-foreground">{s.status}</div>
                        {s.status === "accepted" && interests.contacts[s.to_user] && (
                          <div className="mt-1 text-xs text-primary">
                            {interests.contacts[s.to_user].contact_email}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Badge({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
        ok ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className="text-[10px] uppercase tracking-widest opacity-70">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
