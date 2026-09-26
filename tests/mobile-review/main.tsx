import { createRoot } from "react-dom/client";
import { useState } from "react";
import "../../src/styles.css";
import { Route as ImamRoute } from "../../src/routes/_authenticated/imam/index";
import { Route as ProfilesRoute } from "../../src/routes/_authenticated/admin/profiles";
import { EmailNotificationSettings } from "../../src/components/EmailNotificationSettings";
import { MeetingCheckIns } from "../../src/components/MeetingCheckIns";
import { MobileNavigation } from "../../src/components/MobileNavigation";
import { Route as SurveyRoute } from "../../src/routes/_authenticated/survey";

// No real tokens, users, services or send operations. This fixture never deploys.
const events: string[] = [];
const member = (side: string, name: string) => ({
  side,
  display_name: name,
  gender: side === "a" ? "Female" : "Male",
  age: 29,
  uk_city: "London",
  uk_postcode: null,
  distance_km: 5,
  wali: "Family involved",
  contact_email: "fixture-only@example.invalid",
});
const pairings = [
  {
    id: "fixture-1",
    status: "imam_review",
    member_a: member("a", "Amina Example"),
    member_b: member("b", "Yusuf Example"),
    compatibility_score: 87,
    compatibility_summary: {
      strengths: "Shared priorities around faith and family.",
      considerations: "Discuss future living arrangements.",
    },
    meetups: [],
    meetings_remaining: 0,
    shared_meeting_allowance: 0,
    meeting_package_a: null,
    meeting_package_b: null,
  },
  {
    id: "fixture-2",
    status: "scheduled",
    member_a: member("a", "مريم — Fictional member with a long name"),
    member_b: member("b", "Adam Example"),
    compatibility_score: 79,
    compatibility_summary: null,
    meetups: [
      {
        id: "fixture-meeting",
        scheduled_at: "2026-08-01T12:00:00Z",
        venue: "Fictional community meeting room",
        status: "confirmed",
        response_a: "accepted",
        response_b: "accepted",
        wali_required: true,
      },
    ],
    meetings_remaining: 2,
    shared_meeting_allowance: 3,
    meeting_package_a: { meeting_count: 3, amount_pence: 12000 },
    meeting_package_b: { meeting_count: 3, amount_pence: 12000 },
  },
];
const checks = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    due_at: "2026-08-22T12:00:00Z",
    answered_at: null as string | null,
    outcome: null as string | null,
    note: null as string | null,
    created_at: "2026-08-01",
    reviewed_at: null,
  },
];
const prefs = ["matches", "meetings", "check_ins", "payments", "imam"].map((category) => ({
  category,
  enabled: false,
}));
const referrals: {
  id: string;
  referred_name: string;
  referred_email: string;
  status: string;
  created_at: string;
}[] = [];
Object.assign(window, {
  mithaqFixtureCall: async (name: string, args: { data?: Record<string, unknown> }[]) => {
    const data = args[0]?.data ?? {};
    if (name === "amIImam")
      return {
        isImam: true,
        imam: { name: "Example Imam", city: "London", mosque: "Fictional mosque" },
        radius_km: 25,
      };
    if (name === "listImamPairings") return structuredClone(pairings);
    if (name === "listAllProfiles")
      return [
        {
          id: "fixture-user",
          display_name: "مريم — Fictional member with a long name",
          auth_email: "long-fictional-address@example.invalid",
          created_at: "2026-08-01",
          visibility: "discoverable",
          survey_completed: true,
          email_confirmed: true,
          roles: ["user"],
        },
      ];
    if (name === "getMyEmailPreferences")
      return { available: true, sendingEnabled: false, preferences: structuredClone(prefs) };
    if (name === "saveMyEmailPreference") {
      prefs.find((p) => p.category === data.category)!.enabled = !!data.enabled;
      return { ok: true };
    }
    if (name === "getMyCheckIns") return { available: true, items: structuredClone(checks) };
    if (name === "answerMyCheckIn") {
      Object.assign(checks[0], {
        answered_at: new Date().toISOString(),
        outcome: data.outcome,
        note: data.note,
      });
      return { ok: true };
    }
    if (name === "listMyImamReferrals") return structuredClone(referrals);
    if (name === "submitImamReferral") {
      referrals.push({
        id: "fixture-referral",
        referred_name: String(data.name),
        referred_email: String(data.email),
        status: "pending",
        created_at: new Date().toISOString(),
      });
      return { ok: true };
    }
    if (name === "listPairingMessages") return [];
    if (name === "getMyAnswers") return { answers: {}, completed: false };
    if (name === "saveMyAnswers") return { ok: true };
    events.push(name);
    throw new Error("This isolated fixture does not execute that operation.");
  },
});

function App() {
  const [page, setPage] = useState("imam"),
    [open, setOpen] = useState(false);
  const Imam = ImamRoute.options.component,
    Profiles = ProfilesRoute.options.component,
    Survey = SurveyRoute.options.component;
  return (
    <>
      <header className="border-b border-border bg-card p-4">
        <p className="text-sm font-semibold">Isolated QA · fictional data · no live actions</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["imam", "profiles", "email", "check-ins", "survey"].map((name) => (
            <button
              key={name}
              onClick={() => setPage(name)}
              className="rounded-md border border-border px-3 py-2"
            >
              {name}
            </button>
          ))}
          <MobileNavigation open={open} onOpenChange={setOpen}>
            <a href="#main-content" onClick={() => setOpen(false)}>
              Back to review
            </a>
          </MobileNavigation>
        </div>
      </header>
      <main
        id="main-content"
        className={`mx-auto max-w-6xl p-4 ${page === "profiles" ? "admin-content" : "imam-content"}`}
      >
        {page === "imam" ? (
          <Imam />
        ) : page === "profiles" ? (
          <Profiles />
        ) : page === "email" ? (
          <EmailNotificationSettings />
        ) : page === "survey" ? (
          <Survey />
        ) : (
          <MeetingCheckIns />
        )}
      </main>
    </>
  );
}
const fixtureRoot = createRoot(document.getElementById("root")!);
fixtureRoot.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => fixtureRoot.unmount());
