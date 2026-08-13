import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading / error / empty presentation for the admin area.
 * Skeletons deliberately mirror the shape of the real content so the page does
 * not jump when it resolves.
 */

export function PageHeadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4, columns = 2 }: { count?: number; columns?: number }) {
  return (
    <div className={columns === 2 ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-full max-w-sm" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-32 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex gap-4 border-b border-border bg-muted px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 px-4 py-4">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton key={columnIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "This page didn't load",
  message,
  onRetry,
  retrying,
}: {
  title?: string;
  /** Accepts the hook's `string | null` directly; falls back to a readable default. */
  message: string | null | undefined;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm"
    >
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="mt-1 text-muted-foreground">
        {message ?? "The request failed without giving a reason."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is a load failure, not a permissions problem — retrying is usually enough.
      </p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Empty state that has to sit inside an existing <tbody>. */
export function EmptyRow({
  colSpan,
  title,
  message,
}: {
  colSpan: number;
  title: string;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </td>
    </tr>
  );
}
