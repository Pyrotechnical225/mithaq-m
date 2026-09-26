const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createClient } = require("@supabase/supabase-js");

const url = process.env.LOCAL_SUPABASE_URL;
const publishableKey = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.LOCAL_SUPABASE_SECRET_KEY;
const configured = Boolean(url && publishableKey && secretKey);

const clientOptions = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
};

test(
  "local Supabase Auth, RLS and notification outbox work together",
  { skip: configured ? false : "local Supabase credentials were not provided" },
  async () => {
    const admin = createClient(url, secretKey, clientOptions);
    const member = createClient(url, publishableKey, clientOptions);
    const suffix = crypto.randomUUID();
    const password = `Mithaq-local-${suffix}!`;
    const createdUserIds = [];

    try {
      const first = await admin.auth.admin.createUser({
        email: `local-member-${suffix}@example.test`,
        password,
        email_confirm: true,
      });
      assert.equal(first.error, null);
      assert.ok(first.data.user?.id);
      createdUserIds.push(first.data.user.id);

      const second = await admin.auth.admin.createUser({
        email: `local-other-${suffix}@example.test`,
        password,
        email_confirm: true,
      });
      assert.equal(second.error, null);
      assert.ok(second.data.user?.id);
      createdUserIds.push(second.data.user.id);

      const signIn = await member.auth.signInWithPassword({
        email: first.data.user.email,
        password,
      });
      assert.equal(signIn.error, null);
      assert.equal(signIn.data.user?.id, first.data.user.id);

      const ownPreference = await member.from("email_notification_preferences").insert({
        user_id: first.data.user.id,
        category: "matches",
        enabled: false,
      });
      assert.equal(ownPreference.error, null);

      const ownRead = await member
        .from("email_notification_preferences")
        .select("user_id,category,enabled")
        .eq("user_id", first.data.user.id)
        .single();
      assert.equal(ownRead.error, null);
      assert.deepEqual(ownRead.data, {
        user_id: first.data.user.id,
        category: "matches",
        enabled: false,
      });

      const crossUserWrite = await member.from("email_notification_preferences").insert({
        user_id: second.data.user.id,
        category: "matches",
        enabled: true,
      });
      assert.ok(crossUserWrite.error, "RLS must reject another member's preference write");

      const notification = await admin
        .from("notifications")
        .insert({
          user_id: first.data.user.id,
          kind: "introduction_unavailable",
          title: "Local integration test",
          body: "Synthetic local event only",
        })
        .select("id")
        .single();
      assert.equal(notification.error, null);

      const queued = await admin
        .from("notification_email_jobs")
        .select("user_id,notification_id,kind,status")
        .eq("notification_id", notification.data.id)
        .single();
      assert.equal(queued.error, null);
      assert.deepEqual(queued.data, {
        user_id: first.data.user.id,
        notification_id: notification.data.id,
        kind: "introduction_unavailable",
        status: "queued",
      });

      const privateQueueRead = await member.from("notification_email_jobs").select("id").limit(1);
      assert.ok(privateQueueRead.error, "members must not be able to read the email outbox");

      const privateClaim = await member.rpc("claim_notification_email", {
        p_claim_token: crypto.randomUUID(),
      });
      assert.ok(privateClaim.error, "members must not be able to claim email jobs");
    } finally {
      await member.auth.signOut();
      for (const id of createdUserIds.reverse()) await admin.auth.admin.deleteUser(id);
    }
  },
);
