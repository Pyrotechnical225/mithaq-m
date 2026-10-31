import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { amIImam, listImamPairings } from "@/lib/imam.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImamReferrals } from "@/components/ImamReferrals";
import { PairingDetail } from "@/components/imam/PairingDetail";
import {
  CLOSED_STATUSES,
  REVIEW_STATUSES,
  TONE_CLASS,
  errorText,
  needsAction,
  shortName,
  statusOf,
  type Pairing,
} from "@/lib/imam-workspace";

export const Route = createFileRoute("/_authenticated/imam/")({
  head: () => ({
    meta: [
      { title: "Imam dashboard — Mithaq" },
      { name: "description", content: "Review local pairings and arrange wali-attended meetings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImamDashboard,
});

function ImamDashboard() {
  const whoami = useServerFn(amIImam);
  const list = useServerFn(listImamPairings);

  const [me, setMe] = useState<Awaited<ReturnType<typeof amIImam>> | null>(null);
  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState("matches");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);

  const load = () =>
    list()
      .then((rows) => {
        setPairings(rows);
        setLoadError(null);
      })
      .catch((caught) => setLoadError(errorText(caught)));

  useEffect(() => {
    whoami()
      .then(setMe)
      .catch(() => undefined);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = (pairings ?? []).filter((p) =>
      `${p.id} ${p.member_a.display_name} ${p.member_b.display_name}`.toLowerCase().includes(term),
    );
    return [
      { key: "action", title: "Needs your action", rows: rows.filter(needsAction) },
      {
        key: "progress",
        title: "In progress",
        rows: rows.filter((p) => !needsAction(p) && !CLOSED_STATUSES.has(p.status)),
      },
      { key: "closed", title: "Closed", rows: rows.filter((p) => CLOSED_STATUSES.has(p.status)) },
    ].filter((group) => group.rows.length > 0);
  }, [pairings, query]);

  // Open the first match that needs attention.
  useEffect(() => {
    if (selected || !pairings?.length) return;
    setSelected((pairings.find(needsAction) ?? pairings[0]).id);
  }, [pairings, selected]);

  const current = pairings?.find((p) => p.id === selected) ?? null;
  const count = (predicate: (p: Pairing) => boolean) => (pairings ?? []).filter(predicate).length;

  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches)
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl text-foreground">
            As-salamu alaykum{me?.imam?.name ? `, ${me.imam.name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {me?.imam
              ? `${me.imam.mosque ? `${me.imam.mosque} · ` : ""}${me.imam.city} · covering about ${me.radius_km} km`
              : "Your imam profile is being set up."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Needs review", count((p) => REVIEW_STATUSES.has(p.status)), true],
            ["Ready to arrange", count((p) => p.status === "ready_to_schedule"), true],
            [
              "Awaiting payment",
              count((p) => ["awaiting_payment", "payment_pending"].includes(p.status)),
              false,
            ],
            ["Meetings arranged", count((p) => p.status === "scheduled"), false],
          ].map(([label, value, attention]) => (
            <div
              key={String(label)}
              className={`rounded-lg border px-3 py-2 ${
                attention && Number(value) > 0
                  ? "border-gold/60 bg-gold/10"
                  : "border-border bg-background"
              }`}
            >
              <p className="text-lg font-semibold tabular-nums">{String(value)}</p>
              <p className="text-xs text-muted-foreground">{String(label)}</p>
            </div>
          ))}
        </div>
      </section>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          aria-label="Imam workspace sections"
          className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0 sm:inline-grid sm:w-auto"
        >
          {[
            ["matches", "Matches"],
            ["referrals", "Referring imams"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 rounded-md border border-border bg-card px-5 py-3 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="referrals" className="mt-5">
          <ImamReferrals />
        </TabsContent>

        <TabsContent value="matches" className="mt-5">
          {pairings === null && !loadError && (
            <p className="text-sm text-muted-foreground">Loading your matches…</p>
          )}
          {pairings?.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No matches are assigned to you yet. You will get an email when one needs your review.
            </p>
          )}
          {!!pairings?.length && (
            <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
              <nav
                aria-label="Your matches"
                className="space-y-4 rounded-lg border border-border bg-muted/40 p-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
              >
                <label className="relative block">
                  <span className="sr-only">Search matches</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    placeholder="Search by name or reference"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-h-11 w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm"
                  />
                </label>
                {groups.length === 0 && (
                  <p className="px-1 text-sm text-muted-foreground">No matches fit your search.</p>
                )}
                {groups.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {group.title} · {group.rows.length}
                    </p>
                    {group.rows.map((p) => {
                      const status = statusOf(p);
                      const discuss = p.comparison.rows.filter(
                        (row) => row.verdict === "discuss",
                      ).length;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-current={selected === p.id ? "true" : undefined}
                          onClick={() => select(p.id)}
                          className={`hover-lift block w-full rounded-lg border bg-card p-3 text-left ${
                            selected === p.id
                              ? "border-primary ring-1 ring-primary"
                              : "border-border"
                          }`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold leading-5">
                              {shortName(p.member_a)} &amp; {shortName(p.member_b)}
                            </span>
                            <span className="font-semibold tabular-nums text-primary">
                              {p.compatibility_score == null ? "—" : `${p.compatibility_score}%`}
                            </span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${TONE_CLASS[status.tone]}`}
                            >
                              {status.label}
                            </span>
                            {discuss > 0 && <span>{discuss} to discuss</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>

              <div ref={detailRef} className="min-w-0 scroll-mt-24">
                {current ? (
                  <PairingDetail key={current.id} pairing={current} reload={load} />
                ) : (
                  <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Choose a match to see the comparison.
                  </p>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
