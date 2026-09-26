import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { MobileNavigation } from "@/components/MobileNavigation";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { PairingsSection } from "@/components/PairingsSection";
import { MeetingCheckIns } from "@/components/MeetingCheckIns";
import { supabase } from "@/integrations/supabase/client";
import { amIAdmin } from "@/lib/admin.functions";
import { amIImam } from "@/lib/imam.functions";
import { generateMatches, getLatestMatches } from "@/lib/matches.functions";
import { getMyPrivacy } from "@/lib/privacy.functions";
import { getMyAnswers } from "@/lib/survey.functions";
import { getMyTrustSettings } from "@/lib/trust.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Your Mithaq journey" }, { name: "robots", content: "noindex" }],
  }),
  component: Dashboard,
});

type JourneyStep = 1 | 2 | 3 | 4;

const journeyLabels = ["Survey", "Privacy", "Compatibility", "Introductions"] as const;

function Dashboard() {
  const navigate = useNavigate();
  const fetchAnswers = useServerFn(getMyAnswers);
  const fetchPrivacy = useServerFn(getMyPrivacy);
  const fetchLatestMatches = useServerFn(getLatestMatches);
  const scoreProfiles = useServerFn(generateMatches);
  const checkAdmin = useServerFn(amIAdmin);
  const checkImam = useServerFn(amIImam);
  const fetchTrust = useServerFn(getMyTrustSettings);

  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [introductionProgress, setIntroductionProgress] =
    useState<Awaited<ReturnType<typeof getLatestMatches>>>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isImam, setIsImam] = useState(false);
  const [adminStep, setAdminStep] = useState<JourneyStep | null>(null);
  const [openAIConsent, setOpenAIConsent] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAnswers(),
      fetchPrivacy(),
      fetchLatestMatches(),
      checkAdmin(),
      checkImam(),
      fetchTrust(),
    ])
      .then(([answers, privacy, latestMatches, admin, imam, trust]) => {
        setCompleted(!!answers?.completed);
        setDiscoverable(privacy?.visibility === "discoverable");
        setSubmitted(!!latestMatches);
        setIntroductionProgress(latestMatches);
        setIsAdmin(!!admin.isAdmin);
        setIsImam(!!imam.isImam);
        setAdultConfirmed(!!trust.adult_confirmed_at);
        setPrivacyNoticeAccepted(!!trust.privacy_notice_accepted_at);
        setOpenAIConsent(!!trust.active_compatibility_consent);
      })
      .catch(async (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.startsWith("Unauthorized:")) {
          await supabase.auth.signOut({ scope: "local" });
          window.location.replace("/auth?next=%2Fdashboard");
          return;
        }

        console.error("Mithaq journey could not be loaded", error);
        setMessage("Your journey could not be loaded. Please refresh and try again.");
      })
      .finally(() => setLoading(false));

    const closeMenu = (event: KeyboardEvent) => event.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const beginMatching = async () => {
    setRunning(true);
    setMessage(null);
    try {
      await scoreProfiles({
        data: {
          openaiConsent: true,
          adultConfirmed: true,
          privacyNoticeAccepted: true,
        },
      });
      setSubmitted(true);
      setIntroductionProgress(await fetchLatestMatches());
      setAdminStep(null);
      setMessage(
        "Your profile has been submitted. Suitable compatibility scores of 70% or higher can now move to imam review.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compatibility scoring could not start.");
    } finally {
      setRunning(false);
    }
  };

  const earnedStep: JourneyStep = !completed ? 1 : !discoverable ? 2 : !submitted ? 3 : 4;
  const activeStep = adminStep ?? earnedStep;

  const links = (
    <>
      <Link to="/settings" onClick={() => setMenu(false)}>
        Privacy & settings
      </Link>
      {isImam && (
        <Link to="/imam" onClick={() => setMenu(false)}>
          Imam dashboard
        </Link>
      )}
      {isAdmin && (
        <Link to="/admin" onClick={() => setMenu(false)}>
          Admin dashboard
        </Link>
      )}
      <button type="button" onClick={signOut} className="text-left">
        Sign out
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-[4.5rem] sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
              ميثاق
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {links}
          </nav>
          <MobileNavigation open={menu} onOpenChange={setMenu} breakpoint="md" label="Your account">
            <div className="grid gap-2 text-sm">{links}</div>
          </MobileNavigation>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:space-y-7 sm:px-6 sm:py-12"
      >
        <section className="grid gap-5 border-b border-border pb-9 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Your private journey
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              One clear step at a time.
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              Complete your profile, choose your privacy, and submit for private compatibility
              scoring. An imam reviews suitable results before anonymous introductions are shown.
            </p>
          </div>
          <p className="text-sm font-medium text-primary">Step {earnedStep} of 4</p>
        </section>

        <section
          aria-label="Journey progress"
          className="rounded-lg border border-border bg-card p-5 sm:p-6"
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-4">
            {journeyLabels.map((label, index) => {
              const step = (index + 1) as JourneyStep;
              const done = earnedStep > step;
              const current = activeStep === step;
              return (
                <div
                  key={label}
                  aria-current={current ? "step" : undefined}
                  className="flex min-w-0 items-center gap-2 text-left sm:block sm:text-center"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold sm:mx-auto ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : current
                          ? "bg-gold text-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check size={17} aria-label="Complete" /> : step}
                  </span>
                  <p className="text-xs text-muted-foreground sm:mt-2 sm:text-sm">{label}</p>
                </div>
              );
            })}
          </div>
        </section>

        {isAdmin && (
          <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Admin journey testing</p>
                <p className="text-xs text-muted-foreground">
                  Preview any step without changing account progress.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {journeyLabels.map((label, index) => {
                  const step = (index + 1) as JourneyStep;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAdminStep(step)}
                      className={`rounded-md px-3 py-1.5 text-xs ${
                        activeStep === step
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground"
                      }`}
                    >
                      {step}. {label}
                    </button>
                  );
                })}
                {adminStep && (
                  <button
                    type="button"
                    onClick={() => setAdminStep(null)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground"
                  >
                    Actual progress
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {loading ? (
          <section className="rounded-lg border border-border bg-card p-7" aria-live="polite">
            <p className="text-sm text-muted-foreground">Loading your next step…</p>
          </section>
        ) : (
          <JourneyCard step={activeStep}>
            {activeStep === 1 && (
              <>
                <p className="text-muted-foreground">
                  Tell us about your values, religious practice, family expectations, and marriage
                  goals. Your answers can be reviewed before submission.
                </p>
                <Link
                  to="/survey"
                  className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  {completed ? "Review survey answers" : "Start my survey"}
                </Link>
              </>
            )}

            {activeStep === 2 && (
              <>
                <p className="text-muted-foreground">
                  You control whether your completed profile can enter private compatibility
                  scoring. Your identity is not shown to other members at this stage.
                </p>
                <Link
                  to="/settings"
                  className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  Open privacy settings
                </Link>
              </>
            )}

            {activeStep === 3 && (
              <>
                <p className="text-muted-foreground">
                  The fixed Mithaq rubric provides the primary score. OpenAI supplies a limited
                  secondary review using anonymised multiple-choice answers only.
                </p>
                <div className="mt-5 grid gap-3">
                  <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={adultConfirmed}
                      onChange={(event) => setAdultConfirmed(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-input"
                    />
                    <span>I confirm that I am at least 18 years old.</span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={privacyNoticeAccepted}
                      onChange={(event) => setPrivacyNoticeAccepted(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-input"
                    />
                    <span>
                      I have read and accept the current{" "}
                      <Link to="/privacy" className="font-medium text-primary underline">
                        privacy notice
                      </Link>
                      .
                    </span>
                  </label>
                </div>
                <label className="mt-5 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={openAIConsent}
                    onChange={(event) => setOpenAIConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-input"
                  />
                  <span>
                    I consent to private compatibility processing and to Mithaq sending anonymised
                    multiple-choice survey answers to OpenAI for a limited 20% secondary review.
                    Names, contact details, account IDs, and free-text answers are excluded. The
                    fixed rubric is used if OpenAI is unavailable.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={
                    !completed ||
                    !discoverable ||
                    !adultConfirmed ||
                    !privacyNoticeAccepted ||
                    !openAIConsent ||
                    running
                  }
                  onClick={beginMatching}
                  className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  {running ? "Scoring compatibility…" : "Submit for compatibility scoring"}
                </button>
              </>
            )}

            {activeStep === 4 && (
              <>
                <p className="text-muted-foreground">
                  Your profile is in the private introduction stage. Only scores of 70% or higher
                  move forward for imam review. If an imam approves, you and the other member can
                  review anonymous profiles independently.
                </p>
                <div className="mt-5 border-l-2 border-primary bg-primary/5 p-4 text-sm text-foreground">
                  Matching and profile review remain free. Payment is requested only after both
                  members accept and the imam approves the pairing.
                </div>
                {introductionProgress && (
                  <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border p-3">
                      <dt className="text-xs text-muted-foreground">With an imam</dt>
                      <dd className="mt-1 text-xl font-semibold text-foreground">
                        {introductionProgress.awaiting_imam_review}
                      </dd>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <dt className="text-xs text-muted-foreground">Ready for your response</dt>
                      <dd className="mt-1 text-xl font-semibold text-foreground">
                        {introductionProgress.ready_for_member_review}
                      </dd>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <dt className="text-xs text-muted-foreground">Active introductions</dt>
                      <dd className="mt-1 text-xl font-semibold text-foreground">
                        {introductionProgress.active_introductions}
                      </dd>
                    </div>
                  </dl>
                )}
              </>
            )}
          </JourneyCard>
        )}

        {message && (
          <p
            className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground"
            role="status"
          >
            {message}
          </p>
        )}

        {!loading && activeStep === 4 && <PairingsSection />}
        {!loading && <MeetingCheckIns />}

        <section className="border-t border-border pt-8">
          <h2 className="text-xl font-semibold text-foreground">
            What happens after an introduction?
          </h2>
          <ol className="mt-5 grid gap-x-10 text-sm text-muted-foreground sm:grid-cols-2">
            {[
              "The imam reviews suitable compatibility results.",
              "Both members review the score and anonymous profile.",
              "Each member independently accepts or declines.",
              "After mutual acceptance, each chooses a meeting package.",
              "Choose 1 meeting for £50, 3 for £120, or 5 for £175.",
              "The imam arranges the meeting with both families.",
            ].map((item, index) => (
              <li
                key={item}
                className="grid grid-cols-[2rem_1fr] gap-3 border-t border-border py-4"
              >
                <span className="font-semibold text-primary">0{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

function JourneyCard({ step, children }: { step: JourneyStep; children: React.ReactNode }) {
  const titles: Record<JourneyStep, string> = {
    1: "Complete your survey",
    2: "Choose your privacy",
    3: "Submit for compatibility scoring",
    4: "Private introductions",
  };

  return (
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Step {step} of 4
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{titles[step]}</h2>
      <div className="mt-4 max-w-3xl leading-7">{children}</div>
    </section>
  );
}
