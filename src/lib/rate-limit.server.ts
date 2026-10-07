type RateLimitOptions = {
  table: string;
  userColumn: string;
  userId: string;
  windowMinutes: number;
  max: number;
  message: string;
};

/**
 * Counts the caller's own recent rows and refuses once `max` is reached
 * within the window. Uses the tables the action writes to, so no extra
 * storage is needed and the limit survives across serverless instances.
 */
export async function assertWithinRateLimit(
  // Typed clients cannot index tables by a runtime string.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  { table, userColumn, userId, windowMinutes, max, message }: RateLimitOptions,
) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(userColumn, userId)
    .gte("created_at", since);
  if (error) throw new Error("Please try again in a moment.");
  if ((count ?? 0) >= max) throw new Error(message);
}
