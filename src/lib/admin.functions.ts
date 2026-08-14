import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  RUBRIC_VERSION,
  fixedCompatibilityScore,
  normalized,
  reviewCandidates,
  weightedFinalScore,
  type Answers,
} from "./compatibility.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// -----------------------------------------------------------------------------
// Admin: list all profiles with auth email + status flags
// -----------------------------------------------------------------------------
export const listAllProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: profiles },
      { data: privacy },
      { data: surveys },
      { data: usersList },
      { data: roles },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, contact_email, created_at"),
      supabaseAdmin.from("privacy_settings").select("user_id, visibility"),
      supabaseAdmin.from("survey_answers").select("user_id, completed, updated_at"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    const privacyMap = new Map((privacy ?? []).map((p) => [p.user_id, p.visibility]));
    const surveyMap = new Map((surveys ?? []).map((s) => [s.user_id, s]));
    const authMap = new Map((usersList?.users ?? []).map((u) => [u.id, u]));
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    }

    // Include auth users who have no profile row yet
    const ids = new Set<string>((profiles ?? []).map((p) => p.id));
    for (const u of usersList?.users ?? []) ids.add(u.id);

    return Array.from(ids)
      .map((id) => {
        const p = (profiles ?? []).find((x) => x.id === id);
        const auth = authMap.get(id);
        const s = surveyMap.get(id);
        return {
          id,
          display_name: p?.display_name ?? null,
          contact_email: p?.contact_email ?? auth?.email ?? null,
          auth_email: auth?.email ?? null,
          email_confirmed: !!auth?.email_confirmed_at,
          created_at: p?.created_at ?? auth?.created_at ?? null,
          visibility: privacyMap.get(id) ?? "hidden",
          survey_completed: !!s?.completed,
          survey_updated_at: s?.updated_at ?? null,
          roles: roleMap.get(id) ?? [],
        };
      })
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  });

// -----------------------------------------------------------------------------
// Admin: get full profile detail
// -----------------------------------------------------------------------------
const IdInput = z.object({ user_id: z.string().uuid() });

export const getProfileDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: profile },
      { data: survey },
      { data: privacy },
      { data: matches },
      { data: interests },
      { data: authUser },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
      supabaseAdmin.from("survey_answers").select("*").eq("user_id", data.user_id).maybeSingle(),
      supabaseAdmin.from("privacy_settings").select("*").eq("user_id", data.user_id).maybeSingle(),
      supabaseAdmin
        .from("matches")
        .select("*")
        .eq("user_id", data.user_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("interests")
        .select("*")
        .or(`from_user.eq.${data.user_id},to_user.eq.${data.user_id}`),
      supabaseAdmin.auth.admin.getUserById(data.user_id),
    ]);

    return {
      profile,
      survey,
      privacy,
      matches: matches ?? [],
      interests: interests ?? [],
      auth: authUser?.user
        ? {
            email: authUser.user.email,
            email_confirmed_at: authUser.user.email_confirmed_at,
            created_at: authUser.user.created_at,
            last_sign_in_at: authUser.user.last_sign_in_at,
          }
        : null,
    };
  });

// -----------------------------------------------------------------------------
// Admin: update profile fields
// -----------------------------------------------------------------------------
const UpdateProfileInput = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().max(200).optional(),
  contact_email: z.string().email().max(320).optional(),
  answers: z.record(z.string(), z.string()).optional(),
  completed: z.boolean().optional(),
  visibility: z.enum(["hidden", "discoverable", "paused"]).optional(),
  show_free_text: z.boolean().optional(),
  reveal_contact_on_mutual: z.boolean().optional(),
  show_location: z.boolean().optional(),
  show_occupation: z.boolean().optional(),
});

export const updateProfileAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.display_name !== undefined || data.contact_email !== undefined) {
      const patch: Record<string, unknown> = {};
      if (data.display_name !== undefined) patch.display_name = data.display_name;
      if (data.contact_email !== undefined) patch.contact_email = data.contact_email;
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: data.user_id, ...patch }, { onConflict: "id" });
    }
    if (data.answers !== undefined || data.completed !== undefined) {
      const patch: { user_id: string; answers?: Record<string, string>; completed?: boolean } = {
        user_id: data.user_id,
      };
      if (data.answers !== undefined) patch.answers = data.answers;
      if (data.completed !== undefined) patch.completed = data.completed;
      await supabaseAdmin.from("survey_answers").upsert(patch, { onConflict: "user_id" });
    }
    const privPatch: Record<string, unknown> = {};
    for (const k of [
      "visibility",
      "show_free_text",
      "reveal_contact_on_mutual",
      "show_location",
      "show_occupation",
    ] as const) {
      if (data[k] !== undefined) privPatch[k] = data[k];
    }
    if (Object.keys(privPatch).length > 0) {
      await supabaseAdmin
        .from("privacy_settings")
        .upsert({ user_id: data.user_id, ...privPatch }, { onConflict: "user_id" });
    }
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Admin: create profile (new auth user, auto-confirmed)
// -----------------------------------------------------------------------------
const CreateProfileInput = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(200),
  answers: z.record(z.string(), z.string()).optional(),
});

export const createProfileAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name },
    });
    if (error) throw new Error(error.message);
    const id = created.user!.id;
    await supabaseAdmin.from("profiles").upsert(
      {
        id,
        display_name: data.display_name,
        contact_email: data.email,
      },
      { onConflict: "id" },
    );
    await supabaseAdmin.from("privacy_settings").upsert({ user_id: id }, { onConflict: "user_id" });
    if (data.answers) {
      await supabaseAdmin.from("survey_answers").upsert(
        {
          user_id: id,
          answers: data.answers,
          completed: false,
        },
        { onConflict: "user_id" },
      );
    }
    return { id };
  });

// -----------------------------------------------------------------------------
// Admin: delete profile (removes auth user; cascades to public tables)
// -----------------------------------------------------------------------------
export const deleteProfileAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Admin: export (JSON or CSV) — returns string payload
// -----------------------------------------------------------------------------
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

const ExportInput = z.object({
  format: z.enum(["json", "csv"]),
  user_id: z.string().uuid().optional(),
});

export const exportProfilesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExportInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let profileQ = supabaseAdmin.from("profiles").select("*");
    let surveyQ = supabaseAdmin.from("survey_answers").select("*");
    let privQ = supabaseAdmin.from("privacy_settings").select("*");
    if (data.user_id) {
      profileQ = profileQ.eq("id", data.user_id);
      surveyQ = surveyQ.eq("user_id", data.user_id);
      privQ = privQ.eq("user_id", data.user_id);
    }
    const [{ data: profiles }, { data: surveys }, { data: privacy }] = await Promise.all([
      profileQ,
      surveyQ,
      privQ,
    ]);
    const merged = (profiles ?? []).map((p) => {
      const s = (surveys ?? []).find((x) => x.user_id === p.id);
      const pr = (privacy ?? []).find((x) => x.user_id === p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        contact_email: p.contact_email,
        created_at: p.created_at,
        visibility: pr?.visibility ?? null,
        show_free_text: pr?.show_free_text ?? null,
        survey_completed: s?.completed ?? false,
        answers: s?.answers ?? {},
      };
    });
    if (data.format === "json") {
      return {
        filename: `mithaq-profiles-${Date.now()}.json`,
        mime: "application/json",
        body: JSON.stringify(merged, null, 2),
      };
    }
    // For CSV flatten answer keys
    const flat = merged.map((m) => {
      const answers = (m.answers ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {
        id: m.id,
        display_name: m.display_name,
        contact_email: m.contact_email,
        created_at: m.created_at,
        visibility: m.visibility,
        survey_completed: m.survey_completed,
      };
      for (const [k, v] of Object.entries(answers)) out[`q${k}`] = v;
      return out;
    });
    return { filename: `mithaq-profiles-${Date.now()}.csv`, mime: "text/csv", body: toCsv(flat) };
  });

// -----------------------------------------------------------------------------
// Admin: quick stats
// -----------------------------------------------------------------------------
export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { count: profileCount },
      { count: completedCount },
      { count: discoverableCount },
      { count: interestCount },
      { data: users },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("survey_answers")
        .select("*", { count: "exact", head: true })
        .eq("completed", true),
      supabaseAdmin
        .from("privacy_settings")
        .select("*", { count: "exact", head: true })
        .eq("visibility", "discoverable"),
      supabaseAdmin.from("interests").select("*", { count: "exact", head: true }),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 5 }),
    ]);
    return {
      profileCount: profileCount ?? 0,
      completedCount: completedCount ?? 0,
      discoverableCount: discoverableCount ?? 0,
      interestCount: interestCount ?? 0,
      recentUsers: (users?.users ?? []).slice(0, 5).map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      })),
    };
  });

type StoredCompatibilityMatch = {
  match_user_id?: string;
  score?: number;
  fixed_score?: number;
  openai_score?: number | null;
  scoring_method?: string;
  strengths?: string;
  considerations?: string;
};

export const listCompatibilityComparisonsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: generations, error } = await supabaseAdmin
      .from("matches")
      .select("id, user_id, results, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const profileIds = new Set<string>();
    for (const generation of generations ?? []) {
      profileIds.add(generation.user_id);
      const result = generation.results as { matches?: StoredCompatibilityMatch[] } | null;
      for (const match of result?.matches ?? []) {
        if (match.match_user_id) profileIds.add(match.match_user_id);
      }
    }

    const { data: profiles } = profileIds.size
      ? await supabaseAdmin
          .from("profiles")
          .select("id, display_name, contact_email")
          .in("id", Array.from(profileIds))
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return (generations ?? []).flatMap((generation) => {
      const result = generation.results as { matches?: StoredCompatibilityMatch[] } | null;
      return (result?.matches ?? []).map((match, index) => {
        const member = profileById.get(generation.user_id);
        const candidate = match.match_user_id ? profileById.get(match.match_user_id) : undefined;
        const finalScore = Math.round(match.score ?? 0);
        const fixedScore = Math.round(match.fixed_score ?? finalScore);
        const openAIScore =
          typeof match.openai_score === "number" ? Math.round(match.openai_score) : null;

        return {
          id: `${generation.id}-${match.match_user_id ?? index}`,
          generated_at: generation.created_at,
          member: member?.display_name || member?.contact_email || generation.user_id,
          candidate:
            candidate?.display_name || candidate?.contact_email || match.match_user_id || "Unknown",
          final_score: finalScore,
          fixed_score: fixedScore,
          openai_score: openAIScore,
          difference: openAIScore === null ? null : openAIScore - fixedScore,
          scoring_method: match.scoring_method ?? "legacy",
          strengths: match.strengths ?? "",
          considerations: match.considerations ?? "",
        };
      });
    });
  });

// -----------------------------------------------------------------------------
// Admin: compare one member against the entire eligible pool.
//
// Deliberately different from the member-facing generateMatches: no
// `discoverable` filter, no 70-point cut, no top-5 slice. The admin sees every
// eligible candidate and every score. Imams and admins are excluded via the
// same shared helper the member flow uses, so the two pools cannot drift.
// -----------------------------------------------------------------------------
const CompareInput = z.object({
  userId: z.string().uuid(),
  refresh: z.boolean().optional(),
});

export type PoolExclusionReason =
  "self" | "incomplete_survey" | "no_gender" | "same_gender" | "imam" | "admin";

type PoolCandidate = {
  user_id: string;
  answers: Answers;
  discoverable: boolean;
};

/** Shared by both admin matrix handlers: builds the eligible pool + exclusions. */
async function buildComparisonPool(subjectUserId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getExcludedUserIdsByReason } = await import("./match-exclusions.server");

  const [{ data: subjectRow }, { data: surveys, error: surveyError }, { data: privacyRows }] =
    await Promise.all([
      supabaseAdmin
        .from("survey_answers")
        .select("answers, completed")
        .eq("user_id", subjectUserId)
        .maybeSingle(),
      supabaseAdmin.from("survey_answers").select("user_id, answers, completed"),
      supabaseAdmin.from("privacy_settings").select("user_id, visibility"),
    ]);
  if (surveyError) throw new Error(surveyError.message);

  const subjectAnswers = (subjectRow?.answers ?? {}) as Answers;
  const subjectComplete = !!subjectRow?.completed;
  const subjectGender = normalized(subjectAnswers["2"]);

  const { admins, imams } = await getExcludedUserIdsByReason();
  const discoverableBy = new Map(
    (privacyRows ?? []).map((row) => [row.user_id, row.visibility === "discoverable"]),
  );

  const exclusions: Record<PoolExclusionReason, number> = {
    self: 0,
    incomplete_survey: 0,
    no_gender: 0,
    same_gender: 0,
    imam: 0,
    admin: 0,
  };

  const pool: PoolCandidate[] = [];
  for (const row of surveys ?? []) {
    if (row.user_id === subjectUserId) {
      exclusions.self += 1;
      continue;
    }
    // Order matters only for reporting; each candidate is counted once.
    if (imams.has(row.user_id)) {
      exclusions.imam += 1;
      continue;
    }
    if (admins.has(row.user_id)) {
      exclusions.admin += 1;
      continue;
    }
    if (!row.completed) {
      exclusions.incomplete_survey += 1;
      continue;
    }
    const answers = (row.answers ?? {}) as Answers;
    const gender = normalized(answers["2"]);
    if (!gender) {
      exclusions.no_gender += 1;
      continue;
    }
    if (subjectGender && gender === subjectGender) {
      exclusions.same_gender += 1;
      continue;
    }
    pool.push({
      user_id: row.user_id,
      answers,
      discoverable: discoverableBy.get(row.user_id) === true,
    });
  }

  return { subjectAnswers, subjectComplete, subjectGender, pool, exclusions };
}

async function loadProfileLabels(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { display_name: string | null }>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  return new Map((data ?? []).map((row) => [row.id, { display_name: row.display_name }]));
}

export const compareMemberAgainstPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompareInput.parse(input))
  .handler(async ({ data, context }) => {
    // Admin-only at the server function, not just the route guard.
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { subjectAnswers, subjectComplete, subjectGender, pool, exclusions } =
      await buildComparisonPool(data.userId);

    // The subject's own facts for the header card. Non-text answers only.
    const subject = {
      age: subjectAnswers["1"] ?? null,
      city: subjectAnswers["3"] ?? null,
      madhab: subjectAnswers["10"] ?? null,
      practice_level: subjectAnswers["11"] ?? null,
      gender: subjectAnswers["2"] ?? null,
    };

    if (!subjectComplete) {
      return {
        status: "subject_survey_incomplete" as const,
        rows: [],
        subject,
        exclusions,
        rubricVersion: RUBRIC_VERSION,
      };
    }
    if (!subjectGender) {
      return {
        status: "subject_no_gender" as const,
        rows: [],
        subject,
        exclusions,
        rubricVersion: RUBRIC_VERSION,
      };
    }

    // Cached AI portions for this subject at the current rubric version.
    const { data: cached } = data.refresh
      ? { data: [] }
      : await supabaseAdmin
          .from("compatibility_scores")
          .select("candidate_user_id, openai_score, strengths, considerations, updated_at")
          .eq("subject_user_id", data.userId)
          .eq("rubric_version", RUBRIC_VERSION);
    const cachedBy = new Map((cached ?? []).map((row) => [row.candidate_user_id, row]));

    const labels = await loadProfileLabels(pool.map((c) => c.user_id));

    const rows = pool
      .map((candidate) => {
        const fixedScore = fixedCompatibilityScore(subjectAnswers, candidate.answers);
        const cachedRow = cachedBy.get(candidate.user_id);
        const openAIScore =
          typeof cachedRow?.openai_score === "number" ? cachedRow.openai_score : null;
        return {
          user_id: candidate.user_id,
          display_name: labels.get(candidate.user_id)?.display_name ?? null,
          age: candidate.answers["1"] ?? null,
          city: candidate.answers["3"] ?? null,
          madhab: candidate.answers["10"] ?? null,
          practice_level: candidate.answers["11"] ?? null,
          discoverable: candidate.discoverable,
          fixed_score: fixedScore,
          openai_score: openAIScore,
          final_score: weightedFinalScore(fixedScore, openAIScore),
          strengths: cachedRow?.strengths ?? null,
          considerations: cachedRow?.considerations ?? null,
          cached_at: cachedRow?.updated_at ?? null,
          fallback_reason: null as string | null,
        };
      })
      .sort((left, right) => right.final_score - left.final_score);

    return { status: "ok" as const, rows, subject, exclusions, rubricVersion: RUBRIC_VERSION };
  });

/**
 * Runs the OpenAI portion in bounded batches and upserts the cache. Split from
 * the call above so the table can paint fixed scores immediately rather than
 * blocking on the slowest batch.
 */
export const refreshPoolAiReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompareInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { subjectAnswers, subjectComplete, subjectGender, pool } = await buildComparisonPool(
      data.userId,
    );
    if (!subjectComplete || !subjectGender || pool.length === 0) {
      return { status: "skipped" as const, reviews: [], failures: [], model: null };
    }

    // Opaque handles only — no name, email or uuid ever reaches the model.
    const anonymised = pool.map((candidate, index) => ({
      candidate_id: `candidate_${index + 1}`,
      answers: candidate.answers,
    }));
    const handleToUser = new Map(
      anonymised.map((candidate, index) => [candidate.candidate_id, pool[index].user_id]),
    );

    const { reviews, failures, model } = await reviewCandidates(subjectAnswers, anonymised);

    const failureByHandle = new Map<string, string>();
    for (const failure of failures) {
      for (const handle of failure.candidate_ids) failureByHandle.set(handle, failure.reason);
    }

    const upserts: Array<{
      subject_user_id: string;
      candidate_user_id: string;
      rubric_version: string;
      fixed_score: number;
      openai_score: number | null;
      final_score: number;
      scoring_method: string;
      strengths: string | null;
      considerations: string | null;
      openai_model: string | null;
      updated_at: string;
    }> = [];
    const out: Array<{
      user_id: string;
      openai_score: number | null;
      final_score: number;
      strengths: string | null;
      considerations: string | null;
      fallback_reason: string | null;
    }> = [];

    for (const candidate of anonymised) {
      const userId = handleToUser.get(candidate.candidate_id)!;
      const poolEntry = pool.find((entry) => entry.user_id === userId)!;
      const fixedScore = fixedCompatibilityScore(subjectAnswers, poolEntry.answers);
      const review = reviews.get(candidate.candidate_id);
      const finalScore = weightedFinalScore(fixedScore, review?.score);
      const fallbackReason = review ? null : (failureByHandle.get(candidate.candidate_id) ?? null);

      out.push({
        user_id: userId,
        openai_score: review?.score ?? null,
        final_score: finalScore,
        strengths: review?.strengths ?? null,
        considerations: review?.considerations ?? null,
        fallback_reason: fallbackReason,
      });

      // Only cache rows that actually carry an AI review; caching a fallback
      // would freeze a transient failure in place until the next manual refresh.
      if (review) {
        upserts.push({
          subject_user_id: data.userId,
          candidate_user_id: userId,
          rubric_version: RUBRIC_VERSION,
          fixed_score: fixedScore,
          openai_score: review.score,
          final_score: finalScore,
          scoring_method: "fixed-rubric-v1-with-openai-review",
          strengths: review.strengths,
          considerations: review.considerations,
          openai_model: model,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabaseAdmin
        .from("compatibility_scores")
        .upsert(upserts, { onConflict: "subject_user_id,candidate_user_id,rubric_version" });
      if (error) throw new Error(`Could not cache compatibility scores: ${error.message}`);
    }

    return { status: "ok" as const, reviews: out, failures, model };
  });

/** Member picker source: everyone who could be a comparison subject. */
export const listComparableMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getExcludedUserIdsByReason } = await import("./match-exclusions.server");

    const [{ data: profiles }, { data: surveys }, { data: privacy }, excluded] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, contact_email"),
      supabaseAdmin.from("survey_answers").select("user_id, answers, completed"),
      supabaseAdmin.from("privacy_settings").select("user_id, visibility"),
      getExcludedUserIdsByReason(),
    ]);

    const surveyBy = new Map((surveys ?? []).map((row) => [row.user_id, row]));
    const visibilityBy = new Map((privacy ?? []).map((row) => [row.user_id, row.visibility]));

    return (profiles ?? [])
      .map((profile) => {
        const survey = surveyBy.get(profile.id);
        const answers = (survey?.answers ?? {}) as Answers;
        return {
          user_id: profile.id,
          display_name: profile.display_name,
          contact_email: profile.contact_email,
          gender: answers["2"] ?? null,
          survey_completed: !!survey?.completed,
          discoverable: visibilityBy.get(profile.id) === "discoverable",
          is_imam: excluded.imams.has(profile.id),
          is_admin: excluded.admins.has(profile.id),
        };
      })
      .sort((left, right) =>
        (left.display_name ?? left.contact_email ?? "").localeCompare(
          right.display_name ?? right.contact_email ?? "",
        ),
      );
  });

// -----------------------------------------------------------------------------
// Check if current user is admin (for UI gating)
// -----------------------------------------------------------------------------
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!data };
  });

// -----------------------------------------------------------------------------
// Admin: imam directory CRUD + seed
// -----------------------------------------------------------------------------
import { findUkCity, UK_CITY_NAMES } from "@/lib/uk-cities";
import { EXAMPLE_IMAMS } from "@/lib/example-imams";
import { EXAMPLE_USERS, EXAMPLE_USER_DOMAIN } from "@/lib/example-users";

const ImamInput = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(80).optional().nullable(),
  mosque: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(120),
  postcode: z.string().max(20).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  languages: z.array(z.string().max(60)).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

function withCityCoords(input: z.infer<typeof ImamInput>) {
  if (input.lat != null && input.lng != null) return input;
  const known = findUkCity(input.city);
  if (known) return { ...input, lat: known.lat, lng: known.lng };
  return input;
}

export const createImam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImamInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = withCityCoords(data);
    const { data: row, error } = await supabaseAdmin
      .from("imams")
      .insert({ ...payload, languages: payload.languages ?? [] })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateImamInput = ImamInput.partial().extend({ id: z.string().uuid() });

export const updateImam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateImamInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("imams").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteImam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("imams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Idempotent: only inserts imams whose (name, city) pair is missing.
export const seedExampleImams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("imams").select("name, city");
    const have = new Set((existing ?? []).map((r) => `${r.name}::${r.city}`));
    const toInsert = EXAMPLE_IMAMS.filter((e) => !have.has(`${e.name}::${e.city}`)).map((e) => {
      const known = findUkCity(e.city);
      return {
        name: e.name,
        title: e.title,
        mosque: e.mosque,
        city: e.city,
        postcode: e.postcode ?? null,
        lat: known?.lat ?? null,
        lng: known?.lng ?? null,
        phone: e.phone ?? null,
        email: e.email ?? null,
        website: e.website ?? null,
        languages: e.languages,
        notes: e.notes ?? null,
      };
    });
    if (toInsert.length === 0) return { inserted: 0, skipped: EXAMPLE_IMAMS.length };
    const { error } = await supabaseAdmin.from("imams").insert(toInsert);
    if (error) throw new Error(error.message);
    return { inserted: toInsert.length, skipped: EXAMPLE_IMAMS.length - toInsert.length };
  });

// -----------------------------------------------------------------------------
// Admin: seed example users (idempotent). Any email ending in mithaq.demo
// is a fixture and can be bulk-deleted.
// -----------------------------------------------------------------------------
export const seedExampleUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    if (listErr) throw new Error(listErr.message);
    const existing = new Map(list.users.map((u) => [u.email?.toLowerCase() ?? "", u]));

    let inserted = 0;
    let skipped = 0;
    for (const ex of EXAMPLE_USERS) {
      const key = ex.email.toLowerCase();
      let userId = existing.get(key)?.id;
      if (!userId) {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: ex.email,
          password: ex.password,
          email_confirm: true,
          user_metadata: { display_name: ex.display_name },
        });
        if (createErr) {
          skipped += 1;
          continue;
        }
        userId = created.user!.id;
        inserted += 1;
      } else {
        skipped += 1;
      }
      const known = findUkCity(ex.uk_city);
      await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          display_name: ex.display_name,
          contact_email: ex.email,
          uk_city: ex.uk_city,
          location_lat: known?.lat ?? null,
          location_lng: known?.lng ?? null,
        },
        { onConflict: "id" },
      );
      await supabaseAdmin.from("privacy_settings").upsert(
        {
          user_id: userId,
          visibility: "discoverable",
        },
        { onConflict: "user_id" },
      );
      await supabaseAdmin.from("survey_answers").upsert(
        {
          user_id: userId,
          answers: ex.answers,
          completed: true,
        },
        { onConflict: "user_id" },
      );
    }
    return { inserted, skipped, total: EXAMPLE_USERS.length };
  });

export const deleteExampleUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
    let deleted = 0;
    for (const u of list?.users ?? []) {
      if (u.email && u.email.toLowerCase().endsWith(EXAMPLE_USER_DOMAIN)) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
        if (!error) deleted += 1;
      }
    }
    return { deleted };
  });

export const ADMIN_UK_CITIES = UK_CITY_NAMES;
