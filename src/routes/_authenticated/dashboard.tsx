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
import { getMyMembership } from "@/lib/membership.functions";
import { PairingsSection } from "@/components/PairingsSection";
import { amIAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Your Mithaq dashboard" }, { name: "robots", content: "noindex" }],
  }),
  component: Dashboard,
});

const dashboardSteps = [
  { label: "Complete your profile", short: "Profile" },
  { label: "Choose your privacy", short: "Privacy" },
  { label: "Activate membership", short: "Membership" },
  { label: "Confirm wali involvement", short: "Wali" },
  { label: "Review your matches", short: "Matches" },
  { label: "Manage interests", short: "Interests" },
  { label: "Find an imam", short: "Imam" },
] as const;

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
  const checkAdmin = useServerFn(amIAdmin);

  const [email, setEmail] = useState<string>("");
  const [completed, setCompleted] = useState(false);
  const [visibility, setVisibility] = useState<string>("hidden");
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [matchedAt, setMatchedAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState<Awaited<ReturnType<typeof listInterests>> | null>(
    null,
  );
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [memberActive, setMemberActive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const fetchMembership = useServerFn(getMyMembership);
  useEffect(() => {
    fetchMembership()
      .then((m) => setMemberActive(!!m.active))
      .catch(() => setMemberActive(false));
    checkAdmin()
      .then((r) => setIsAdmin(!!r.isAdmin))
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      fetchAnswers(),
      fetchPrivacy(),
      fetchMatches(),
      fetchInterests(),
      fetchLocation(),
      fetchImams(),
    ]).then(([a, p, m, i, loc, im]) => {
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
    });
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
      const r = await saveLocation({
        data: { uk_city: locCity || null, uk_postcode: locPostcode || null },
      });
      setLocMsg(
        r.matched_city
          ? `Saved. Nearby imams sorted by distance from ${r.matched_city}.`
          : "Saved.",
      );
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
      const distKm =
        locLat != null && locLng != null && im.lat != null && im.lng != null
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
  const [currentStep, setCurrentStep] = useState(0);
  const interestCount = (interests?.received.length ?? 0) + (interests?.sent.length ?? 0);
  const stepCompletion = [
    completed,
    visibility === "discoverable",
    memberActive,
    waliConfirmed,
    matches !== null,
    interestCount > 0,
    Boolean(locCity),
  ];
  const maxUnlockedStep = isAdmin
    ? 6
    : !completed
      ? 0
      : visibility !== "discoverable"
        ? 1
        : !memberActive
          ? 2
          : !waliConfirmed
            ? 3
            : matches === null
              ? 4
              : 6;

  useEffect(() => {
    if (!completed) setCurrentStep(0);
    else if (visibility !== "discoverable") setCurrentStep(1);
    else if (!memberActive) setCurrentStep(2);
    else if (!waliConfirmed) setCurrentStep(3);
    else if (matches === null) setCurrentStep(4);
  }, [completed, visibility, memberActive, waliConfirmed, matches]);

  const goNext = () => setCurrentStep((step) => Math.min(step + 1, 6));
  const goBack = () => setCurrentStep((step) => Math.max(step - 1, 0));
  const canContinue = isAdmin || currentStep === 5 || stepCompletion[currentStep];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-arabic text-2xl text-primary">م</span>
            <span className="font-display text-lg text-foreground">Mithaq</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {isAdmin && (
              <Link
                to="/admin"
                className="rounded-full bg-primary px-3 py-1 text-primary-foreground hover:bg-primary/90"
              >
                Admin dashboard
              </Link>
            )}
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

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        {isAdmin ? (
          <aside className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gold/10 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Administrator testing mode</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All seven member steps are unlocked for this admin account.
              </p>
            </div>
            <Link
              to="/admin"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open admin dashboard
            </Link>
          </aside>
        ) : null}

        <section className="mb-8 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                Your marriage journey
              </p>
              <h1 className="mt-2 text-3xl text-foreground">One clear step at a time</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Step {currentStep + 1} of 7 · {dashboardSteps[currentStep].label}
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              {Math.round(((currentStep + 1) / 7) * 100)}% through the journey
            </span>
          </div>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: ((currentStep + 1) / 7) * 100 + "%" }}
            />
          </div>

          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {dashboardSteps.map((step, index) => {
              const unlocked = index <= maxUnlockedStep;
              const active = index === currentStep;
              return (
                <li key={step.label}>
                  <button
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setCurrentStep(index)}
                    className={
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : stepCompletion[index]
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : unlocked
                            ? "bg-muted text-foreground hover:bg-accent"
                            : "cursor-not-allowed bg-muted/50 text-muted-foreground/50")
                    }
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="font-semibold">{stepCompletion[index] ? "✓" : index + 1}</span>
                    <span className="truncate">{step.short}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="mx-auto max-w-4xl">
          {currentStep === 0 ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 1</p>
              <h2 className="mt-3 text-3xl text-foreground">Complete your profile</h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                Answer the 50 thoughtful questions about your deen, values, family life, and what you
                seek in a spouse. You can return and edit your answers later.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/survey"
                  className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {completed ? "Review my answers" : "Start the survey"}
                </Link>
                <Badge
                  label="Survey"
                  value={completed ? "Completed" : "Not completed"}
                  ok={completed}
                />
              </div>
            </section>
          ) : null}

          {currentStep === 1 ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 2</p>
              <h2 className="mt-3 text-3xl text-foreground">Choose your privacy</h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                Set your profile to Discoverable when you are ready to be considered for matches.
                Your detailed answers remain protected by your privacy settings.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/settings"
                  className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Open privacy settings
                </Link>
                <Badge
                  label="Visibility"
                  value={visibility}
                  ok={visibility === "discoverable"}
                />
              </div>
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 3</p>
              <h2 className="mt-3 text-3xl text-foreground">Activate your membership</h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                Membership unlocks ranked matches, expressions of interest, and imam-supported
                introductions. Your survey and privacy controls remain free.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/membership"
                  className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {memberActive ? "View my membership" : "View membership plans"}
                </Link>
                <Badge
                  label="Membership"
                  value={memberActive ? "Active" : "Not active"}
                  ok={memberActive}
                />
              </div>
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 4</p>
              <h2 className="mt-3 text-3xl text-foreground">Confirm wali involvement</h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                Mithaq encourages family involvement from the beginning. Please review suggested
                matches with your wali or parent before expressing interest.
              </p>
              {!waliConfirmed ? (
                <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-input"
                    onChange={(event) => event.target.checked && confirmWali()}
                  />
                  <span className="text-sm leading-6 text-foreground">
                    I confirm that my wali or parent has agreed to be involved while I review matches.
                  </span>
                </label>
              ) : (
                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/10 p-5">
                  <span className="text-sm font-medium text-primary">✓ Wali or parent confirmed</span>
                  <button
                    type="button"
                    onClick={resetWali}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Undo confirmation
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {currentStep === 4 ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 5</p>
                  <h2 className="mt-3 text-3xl text-foreground">Review your matches</h2>
                  <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                    Matches are ranked across deen, values, family expectations, and life goals.
                    {matchedAt ? " Last generated " + new Date(matchedAt).toLocaleString() + "." : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={running || (!isAdmin && (!canMatch || !memberActive || !waliConfirmed))}
                  onClick={runMatching}
                  className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {running ? "Finding matches…" : matches ? "Refresh matches" : "Find my matches"}
                </button>
              </div>

              {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
              {matches === null ? (
                <div className="mt-7 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Select “Find my matches” when you and your wali are ready.
                </div>
              ) : (
                <div className="mt-7 space-y-4">
                  {matches.length === 0 ? (
                    <p className="rounded-2xl bg-muted p-6 text-sm text-muted-foreground">
                      No compatible profiles yet. Check back as more people join.
                    </p>
                  ) : null}
                  {matches.map((match) => (
                    <article key={match.match_user_id} className="rounded-2xl border border-border p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm text-muted-foreground">
                          {match.age ? <span className="mr-3">Age {match.age}</span> : null}
                          {match.location ? <span className="mr-3">{match.location}</span> : null}
                          {match.madhab ? <span className="mr-3">{match.madhab}</span> : null}
                          {match.practice_level ? <span>{match.practice_level}</span> : null}
                        </div>
                        <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                          {Math.round(match.score)}% match
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-foreground">
                        <span className="font-medium">Strengths — </span>
                        {match.strengths}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Consider — </span>
                        {match.considerations}
                      </p>
                      <button
                        type="button"
                        disabled={sentIds.has(match.match_user_id)}
                        onClick={async () => {
                          await sendInterest({ data: { to_user: match.match_user_id } });
                          setSentIds((ids) => new Set(ids).add(match.match_user_id));
                          fetchInterests().then(setInterests);
                        }}
                        className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {sentIds.has(match.match_user_id) ? "Interest sent" : "Express interest"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {currentStep === 5 ? (
            <div className="space-y-6">
              <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 6</p>
                <h2 className="mt-3 text-3xl text-foreground">Interests and introductions</h2>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  Review expressions of interest and manage accepted introductions in one place.
                </p>

                <div className="mt-7 grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Received</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      {!interests || interests.received.length === 0 ? (
                        <li className="rounded-xl bg-muted p-4 text-muted-foreground">Nothing received yet.</li>
                      ) : null}
                      {interests?.received.map((interest) => (
                        <li key={interest.id} className="rounded-xl border border-border p-4">
                          <div>Someone expressed interest</div>
                          <div className="mt-1 text-xs text-muted-foreground">{interest.status}</div>
                          {interest.status === "accepted" && interests.contacts[interest.from_user] ? (
                            <div className="mt-2 text-xs text-primary">
                              {interests.contacts[interest.from_user].contact_email}
                            </div>
                          ) : null}
                          {interest.status === "pending" ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  await reply({ data: { interest_id: interest.id, accept: true } });
                                  loadAll();
                                }}
                                className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await reply({ data: { interest_id: interest.id, accept: false } });
                                  loadAll();
                                }}
                                className="rounded-full border border-border px-3 py-1.5 text-xs"
                              >
                                Decline
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Sent</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      {!interests || interests.sent.length === 0 ? (
                        <li className="rounded-xl bg-muted p-4 text-muted-foreground">Nothing sent yet.</li>
                      ) : null}
                      {interests?.sent.map((interest) => (
                        <li key={interest.id} className="rounded-xl border border-border p-4">
                          <div>Interest sent</div>
                          <div className="mt-1 text-xs text-muted-foreground">{interest.status}</div>
                          {interest.status === "accepted" && interests.contacts[interest.to_user] ? (
                            <div className="mt-2 text-xs text-primary">
                              {interests.contacts[interest.to_user].contact_email}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
              {memberActive ? <PairingsSection /> : null}
            </div>
          ) : null}

          {currentStep === 6 ? (
            <div className="space-y-6">
              <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 7</p>
                <h2 className="mt-3 text-3xl text-foreground">Find an imam near you</h2>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  Save your location to find imams who can support a wali-attended meeting, provide
                  guidance, or help arrange the nikah.
                </p>
                <div className="mt-7 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">City</span>
                    <select
                      value={locCity}
                      onChange={(event) => setLocCity(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="">Select…</option>
                      {UK_CITIES_FOR_UI.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Postcode (optional)</span>
                    <input
                      value={locPostcode}
                      onChange={(event) => setLocPostcode(event.target.value)}
                      placeholder="e.g. B1 1AA"
                      className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={locSaving || !locCity}
                      onClick={saveLoc}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {locSaving ? "Saving…" : "Save location"}
                    </button>
                  </div>
                </div>
                {locMsg ? <p className="mt-3 text-xs text-muted-foreground">{locMsg}</p> : null}
              </section>

              <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-2xl text-foreground">Imams near you</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {locLat != null ? "Sorted by distance from your saved location." : "Save your location to sort by distance."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={imamCityFilter}
                      onChange={(event) => setImamCityFilter(event.target.value)}
                      className="rounded-full border border-input bg-background px-3 py-1.5 text-xs"
                    >
                      <option value="all">All cities</option>
                      {availableImamCities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    <select
                      value={imamRadius}
                      onChange={(event) => setImamRadius(Number(event.target.value))}
                      className="rounded-full border border-input bg-background px-3 py-1.5 text-xs"
                      disabled={locLat == null}
                    >
                      <option value={0}>Any distance</option>
                      <option value={15}>Within 15 km</option>
                      <option value={40}>Within 40 km</option>
                      <option value={80}>Within 80 km</option>
                      <option value={160}>Within 160 km</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5">
                  <UkImamMap
                    points={rankedImams
                      .filter(
                        (imam): imam is typeof imam & { lat: number; lng: number } =>
                          imam.lat != null && imam.lng != null,
                      )
                      .map<ImamMapPoint>((imam) => ({
                        id: imam.id,
                        name: imam.name,
                        city: imam.city,
                        mosque: imam.mosque,
                        lat: imam.lat,
                        lng: imam.lng,
                        distKm: imam.distKm ?? null,
                      }))}
                    user={locLat != null && locLng != null ? { lat: locLat, lng: locLng } : null}
                  />
                </div>

                <div className="mt-5 space-y-3">
                  {rankedImams.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No imams match your filters yet.</p>
                  ) : null}
                  {rankedImams.map((imam) => (
                    <article key={imam.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <div className="font-medium text-foreground">{imam.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {imam.title}
                            {imam.mosque ? " · " + imam.mosque : ""} · {imam.city}
                            {imam.postcode ? ", " + imam.postcode : ""}
                          </div>
                        </div>
                        {imam.distKm != null ? (
                          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                            {imam.distKm.toFixed(1)} km · {kmToMiles(imam.distKm).toFixed(1)} mi
                          </div>
                        ) : null}
                      </div>
                      {(imam.languages ?? []).length > 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Languages: {(imam.languages ?? []).join(", ")}
                        </div>
                      ) : null}
                      {imam.notes ? <p className="mt-2 text-sm text-foreground">{imam.notes}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        {imam.phone ? <a href={"tel:" + imam.phone} className="text-primary hover:underline">{imam.phone}</a> : null}
                        {imam.email ? <a href={"mailto:" + imam.email} className="text-primary hover:underline">{imam.email}</a> : null}
                        {imam.website ? (
                          <a href={imam.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Website
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          <div className="mt-7 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={goBack}
              className="rounded-full border border-border bg-card px-5 py-2.5 text-sm text-foreground hover:bg-accent disabled:opacity-40"
            >
              Back
            </button>
            {currentStep < 6 ? (
              <button
                type="button"
                disabled={!canContinue}
                onClick={goNext}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Return to matches
              </button>
            )}
          </div>
        </div>
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
