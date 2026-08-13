import { useCallback, useEffect, useRef, useState } from "react";

type ResourceState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };

/**
 * Loads a server function once on mount and exposes an explicit
 * loading / ready / error state plus a `reload` for retry buttons.
 *
 * Admin pages previously rendered a bare "Loading…" string with no `.catch`,
 * so a failed fetch left the page stuck on it forever. Going through this hook
 * means every consumer has to decide what an error looks like.
 */
export function useAsyncResource<T>(load: () => Promise<T>, resetKey?: unknown) {
  // Kept in a ref so an unmemoised `useServerFn` result cannot re-trigger the fetch.
  const loadRef = useRef(load);
  loadRef.current = load;

  const [state, setState] = useState<ResourceState<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `resetKey` is the identity of the thing being loaded (a route param, say).
  // When it changes we re-run from scratch; `load` itself is deliberately not a
  // dependency so an unmemoised server fn can't loop.
  const run = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") {
        setState({ status: "loading", data: null, error: null });
      } else {
        setRefreshing(true);
      }
      try {
        const data = await loadRef.current();
        if (!mounted.current) return;
        setState({ status: "ready", data, error: null });
      } catch (error) {
        if (!mounted.current) return;
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Something went wrong loading this page",
        });
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    // resetKey is intentionally a dependency without appearing in the body:
    // it is the cache key, and changing it must force a fresh load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey],
  );

  useEffect(() => {
    void run("initial");
  }, [run]);

  /** Re-fetch from scratch, showing the skeleton again. Use for retry buttons. */
  const retry = useCallback(() => run("initial"), [run]);
  /** Re-fetch in place, keeping the current rows on screen. Use after a mutation. */
  const reload = useCallback(() => run("refresh"), [run]);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    refreshing,
    retry,
    reload,
    setData: (next: T) => setState({ status: "ready", data: next, error: null }),
  };
}
