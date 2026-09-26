const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260830145528_ses_notification_outbox.sql"),
  "utf8",
);
const workflows = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260830190000_notification_member_workflows.sql"),
  "utf8",
);
const lifecycle = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260831223704_notification_lifecycle.sql"),
  "utf8",
);
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
const pair = "00000000-0000-4000-8000-000000000003",
  meeting = "00000000-0000-4000-8000-000000000004";
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',coalesce(nullif(current_setting('test.aal',true),''),'aal1')) $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz DEFAULT now(),banned_until timestamptz,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.imams(id uuid PRIMARY KEY,verification_status text);
    CREATE TABLE public.imam_accounts(user_id uuid,imam_id uuid,active boolean);
    CREATE TABLE public.user_roles(user_id uuid,role text);
    CREATE TABLE public.admin_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid,action text,target_type text,target_id text,details jsonb);
    CREATE TABLE public.imam_referrals(id uuid PRIMARY KEY,referrer_user_id uuid,status text,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.imam_applications(id uuid PRIMARY KEY,user_id uuid,status text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.survey_answers(user_id uuid PRIMARY KEY,answers jsonb NOT NULL DEFAULT '{}'::jsonb,completed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.privacy_settings(user_id uuid PRIMARY KEY,visibility text NOT NULL DEFAULT 'hidden',updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.pairings(id uuid PRIMARY KEY,user_a uuid,user_b uuid,imam_id uuid,status text,payment_a_status text,payment_b_status text,member_a_response text NOT NULL DEFAULT 'pending',member_b_response text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,pairing_id uuid,kind text);
    CREATE TABLE public.meetups(id uuid PRIMARY KEY, pairing_id uuid, status text, scheduled_at timestamptz,venue text,address text,response_a text NOT NULL DEFAULT 'pending',response_b text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT meetups_status_valid CHECK(status IN ('proposed','confirmed','declined','cancelled')));
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    INSERT INTO auth.users VALUES ('${a}'),('${b}');
    INSERT INTO public.pairings(id,user_a,user_b,imam_id,status,payment_a_status,payment_b_status) VALUES('${pair}','${a}','${b}',NULL,'member_review','not_due','not_due');
  `);
  await db.exec(migration);
  await db.exec(workflows);
  await db.exec(lifecycle);
  return db;
}

test("weekly journey reminders are idempotent, bounded and stop when the step is complete", async () => {
  const db = await fixture();
  try {
    await db.exec(`
      UPDATE auth.users SET created_at='2026-08-01T00:00:00Z' WHERE id='${a}';
      INSERT INTO public.survey_answers(user_id,completed,updated_at) VALUES('${a}',false,'2026-08-01T00:00:00Z');
      INSERT INTO public.privacy_settings(user_id,visibility,updated_at) VALUES('${a}','hidden','2026-08-01T00:00:00Z');
      INSERT INTO public.email_notification_preferences(user_id,category,enabled) VALUES('${a}','journey',true);
      DELETE FROM public.pairings WHERE id='${pair}';
    `);
    assert.equal(
      (
        await db.query(
          "SELECT mithaq_private.enqueue_due_notification_reminders('2026-08-31T08:15:00Z') AS count",
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT mithaq_private.enqueue_due_notification_reminders('2026-08-31T08:15:00Z') AS count",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT mithaq_private.enqueue_due_notification_reminders('2026-09-07T08:15:00Z') AS count",
        )
      ).rows[0].count,
      1,
    );
    await db.exec(
      `UPDATE public.survey_answers SET completed=true WHERE user_id='${a}';UPDATE public.privacy_settings SET visibility='discoverable' WHERE user_id='${a}';`,
    );
    assert.equal(
      (
        await db.query(
          "SELECT mithaq_private.enqueue_due_notification_reminders('2026-09-14T08:15:00Z') AS count",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM public.notification_email_jobs WHERE user_id='" +
            a +
            "' AND kind='journey_progress_reminder'",
        )
      ).rows[0].count,
      2,
    );
  } finally {
    await db.close();
  }
});

test("migration executes and notification inserts create one private job", async () => {
  const db = await fixture();
  try {
    await db.exec(
      `SET ROLE service_role; INSERT INTO public.notifications(user_id,pairing_id,kind) VALUES('${a}','${pair}','anonymous_profile_ready');`,
    );
    const jobs = await db.query("SELECT kind FROM public.notification_email_jobs");
    assert.equal(jobs.rows.length, 1);
    const first = await db.query(
      "SELECT id FROM public.claim_notification_email(gen_random_uuid())",
    );
    const second = await db.query(
      "SELECT id FROM public.claim_notification_email(gen_random_uuid())",
    );
    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("private check-in answers enforce ownership, due date, valid outcome and one submission", async () => {
  const db = await fixture();
  try {
    await db.exec(
      `INSERT INTO public.meetups(id,pairing_id,status,scheduled_at,venue) VALUES('${meeting}','${pair}','confirmed',now()-interval '22 days','Test venue'); UPDATE public.meetups SET status='completed' WHERE id='${meeting}';`,
    );
    const checks = (await db.query("SELECT id,user_id FROM public.meeting_check_ins")).rows;
    const own = checks.find((row) => row.user_id === a).id,
      other = checks.find((row) => row.user_id === b).id;
    await db.exec(`SET ROLE authenticated; SELECT set_config('test.user_id','${a}',false);`);
    assert.equal((await db.query("SELECT id FROM public.meeting_check_ins")).rows.length, 1);
    await assert.rejects(
      db.query(`SELECT public.answer_meeting_check_in('${other}','moving_forward',null)`),
      /not available/,
    );
    await assert.rejects(
      db.query(`SELECT public.answer_meeting_check_in('${own}','bad',null)`),
      /Invalid/,
    );
    await assert.rejects(
      db.query(`UPDATE public.meeting_check_ins SET outcome='moving_forward' WHERE id='${own}'`),
      /permission denied/,
    );
    await db.query(
      `SELECT public.answer_meeting_check_in('${own}','support_requested','Please contact me privately')`,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS count FROM public.notification_email_jobs WHERE kind='member_support_requested'`,
        )
      ).rows[0].count,
      0,
    );
    await db.exec(
      `INSERT INTO public.user_roles VALUES('${b}','admin'); SET ROLE authenticated; SELECT set_config('test.user_id','${b}',false);`,
    );
    const supportCheck = (
      await db.query(`SELECT id FROM public.meeting_check_ins WHERE user_id='${b}'`)
    ).rows[0].id;
    await db.query(
      `SELECT public.answer_meeting_check_in('${supportCheck}','support_requested','Private request')`,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS count FROM public.notification_email_jobs WHERE kind='member_support_requested' AND user_id='${b}' AND check_in_id='${supportCheck}'`,
        )
      ).rows[0].count,
      1,
    );
    await db.exec(`SET ROLE authenticated; SELECT set_config('test.user_id','${a}',false);`);
    await assert.rejects(
      db.query(`SELECT public.answer_meeting_check_in('${own}','moving_forward',null)`),
      /already answered/,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          `SELECT status FROM public.notification_email_jobs WHERE user_id='${a}' AND kind='meeting_followup'`,
        )
      ).rows[0].status,
      "skipped",
    );
    assert.equal(
      (await db.query(`SELECT note FROM public.meeting_check_ins WHERE user_id='${b}'`)).rows[0]
        .note,
      "Private request",
    );
    await db.exec(
      `UPDATE public.meeting_check_ins SET due_at=now()+interval '1 day' WHERE id='${other}';SET ROLE authenticated;SELECT set_config('test.user_id','${b}',false);`,
    );
    await assert.rejects(
      db.query(`SELECT public.answer_meeting_check_in('${other}','moving_forward',null)`),
      /not available/,
    );
    await db.exec("RESET ROLE;SET ROLE anon");
    await assert.rejects(
      db.query(`SELECT public.answer_meeting_check_in('${own}','moving_forward',null)`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("attendance completion requires current assigned verified imam and MFA, and is audited once", async () => {
  const db = await fixture();
  const imam = "00000000-0000-4000-8000-000000000008";
  try {
    await db.exec(
      `INSERT INTO public.imams VALUES('${imam}','verified'); INSERT INTO public.imam_accounts VALUES('${a}','${imam}',true); UPDATE public.pairings SET imam_id='${imam}',status='scheduled' WHERE id='${pair}'; INSERT INTO public.meetups(id,pairing_id,status,scheduled_at,venue) VALUES('${meeting}','${pair}','confirmed',now()-interval '1 day','Test venue'); SET ROLE authenticated;SELECT set_config('test.user_id','${a}',false);`,
    );
    await assert.rejects(db.query(`SELECT public.complete_assigned_meeting('${meeting}')`), /MFA/);
    await db.exec(
      `SELECT set_config('test.aal','aal2',false);SELECT set_config('test.user_id','${b}',false);`,
    );
    await assert.rejects(
      db.query(`SELECT public.complete_assigned_meeting('${meeting}')`),
      /Assigned/,
    );
    await db.exec(
      `SELECT set_config('test.user_id','${a}',false);RESET ROLE;UPDATE public.imam_accounts SET active=false;SET ROLE authenticated;`,
    );
    await assert.rejects(
      db.query(`SELECT public.complete_assigned_meeting('${meeting}')`),
      /Assigned/,
    );
    await db.exec(
      "RESET ROLE;UPDATE public.imam_accounts SET active=true;UPDATE public.imams SET verification_status='suspended';SET ROLE authenticated;",
    );
    await assert.rejects(
      db.query(`SELECT public.complete_assigned_meeting('${meeting}')`),
      /Assigned/,
    );
    await db.exec(
      "RESET ROLE;UPDATE public.imams SET verification_status='verified';SET ROLE authenticated;",
    );
    await db.query(`SELECT public.complete_assigned_meeting('${meeting}')`);
    await assert.rejects(
      db.query(`SELECT public.complete_assigned_meeting('${meeting}')`),
      /confirmed past/,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (await db.query("SELECT * FROM public.admin_audit_log WHERE action='meeting_completed'")).rows
        .length,
      1,
    );
    assert.equal((await db.query("SELECT * FROM public.meeting_check_ins")).rows.length, 2);
  } finally {
    await db.close();
  }
});

test("anonymous/member roles cannot read the outbox or call its worker function", async () => {
  const db = await fixture();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec("SET ROLE " + role);
      await assert.rejects(
        db.query("SELECT * FROM public.notification_email_jobs"),
        /permission denied/i,
      );
      await assert.rejects(
        db.query("SELECT * FROM public.claim_notification_email(gen_random_uuid())"),
        /permission denied/i,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec(
      `SET ROLE authenticated; SELECT set_config('test.user_id','${a}',false); INSERT INTO public.email_notification_preferences(user_id,category,enabled) VALUES('${a}','matches',true);`,
    );
    await assert.rejects(
      db.exec(
        `INSERT INTO public.email_notification_preferences(user_id,category,enabled) VALUES('${b}','matches',true)`,
      ),
      /row-level security/i,
    );
    assert.equal(
      (await db.query("SELECT * FROM public.email_notification_preferences")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});

test("completion creates two check-ins exactly 21 days later, without sending", async () => {
  const db = await fixture();
  try {
    await db.exec(
      `INSERT INTO public.meetups(id,pairing_id,status,scheduled_at,venue) VALUES('${meeting}','${pair}','confirmed',now()-interval '1 day','Test venue'); UPDATE public.meetups SET status='completed' WHERE id='${meeting}';`,
    );
    const checks = await db.query(
      `SELECT c.due_at = m.completed_at + interval '21 days' AND m.completed_at = m.scheduled_at AS exact_delay FROM public.meeting_check_ins c JOIN public.meetups m ON c.meetup_id=m.id`,
    );
    assert.equal(checks.rows.length, 2);
    assert.ok(checks.rows.every((row) => row.exact_delay));
    assert.equal(
      (
        await db.query(
          `SELECT * FROM public.notification_email_jobs WHERE kind='meeting_followup' AND not_before>now() AND status='queued'`,
        )
      ).rows.length,
      2,
    );
    await db.exec(`UPDATE public.meetups SET venue='Corrected venue' WHERE id='${meeting}'`);
    assert.equal((await db.query("SELECT * FROM public.meeting_check_ins")).rows.length, 2);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM public.notification_email_jobs WHERE kind='meeting_followup' AND status='queued'",
        )
      ).rows.length,
      2,
    );
    await assert.rejects(
      db.exec(`UPDATE public.meetups SET status='confirmed' WHERE id='${meeting}'`),
      /audited correction/i,
    );
  } finally {
    await db.close();
  }
});

test("future or unconfirmed meetings cannot be marked completed", async () => {
  const db = await fixture();
  try {
    await db.exec(
      `INSERT INTO public.meetups(id,pairing_id,status,scheduled_at,venue) VALUES('${meeting}','${pair}','confirmed',now()+interval '1 day','Test venue');`,
    );
    await assert.rejects(
      db.exec(`UPDATE public.meetups SET status='completed' WHERE id='${meeting}'`),
      /Only a confirmed meeting/i,
    );
    assert.equal((await db.query("SELECT * FROM public.meeting_check_ins")).rows.length, 0);
    await assert.rejects(
      db.exec(
        `UPDATE public.meetups SET status='completed',scheduled_at=now()-interval '1 day' WHERE id='${meeting}'`,
      ),
      /Only a confirmed meeting/i,
    );
    await db.exec(
      `UPDATE public.meetups SET status='proposed',scheduled_at=now()-interval '1 day' WHERE id='${meeting}'`,
    );
    await assert.rejects(
      db.exec(`UPDATE public.meetups SET status='completed' WHERE id='${meeting}'`),
      /Only a confirmed meeting/i,
    );
    await assert.rejects(
      db.exec(
        `INSERT INTO public.meetups(id,pairing_id,status,scheduled_at,venue) VALUES(gen_random_uuid(),'${pair}','completed',now()-interval '1 day','Test venue')`,
      ),
      /confirmed meeting before/i,
    );
  } finally {
    await db.close();
  }
});

test("rescheduling invalidates the old reminder and queues one replacement per member", async () => {
  const db = await fixture();
  try {
    await db.exec(
      `INSERT INTO public.meetups(id,pairing_id,status,scheduled_at,venue) VALUES('${meeting}','${pair}','confirmed',now()+interval '2 days','Test venue'); UPDATE public.meetups SET scheduled_at=now()+interval '3 days' WHERE id='${meeting}';`,
    );
    const rows = await db.query(
      `SELECT status,count(*)::integer AS n FROM public.notification_email_jobs WHERE kind='meeting_reminder' GROUP BY status ORDER BY status`,
    );
    assert.deepEqual(rows.rows, [
      { status: "queued", n: 2 },
      { status: "skipped", n: 2 },
    ]);
  } finally {
    await db.close();
  }
});

test("expired processing claims become unknown rather than being automatically retried", async () => {
  const db = await fixture();
  try {
    await db.exec(
      `INSERT INTO public.notification_email_jobs(user_id,event_key,kind,status,claimed_at) VALUES('${a}','ambiguous','anonymous_profile_ready','processing',now()-interval '10 minutes');`,
    );
    assert.equal(
      (await db.query("SELECT * FROM public.claim_notification_email(gen_random_uuid())")).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query("SELECT status FROM public.notification_email_jobs")).rows[0].status,
      "unknown",
    );
  } finally {
    await db.close();
  }
});
