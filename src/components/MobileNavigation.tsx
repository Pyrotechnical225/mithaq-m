import { useEffect, type ReactNode } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** One accessible, scrollable navigation drawer shared by every workspace. */
export function MobileNavigation({
  open,
  onOpenChange,
  children,
  label = "Navigation",
  breakpoint = "lg",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  label?: string;
  breakpoint?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia(`(min-width: ${breakpoint === "md" ? 768 : 1024}px)`);
    const closeOnDesktop = () => {
      if (wide.matches) onOpenChange(false);
    };
    wide.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => wide.removeEventListener("change", closeOnDesktop);
  }, [open, breakpoint, onOpenChange]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Open ${label.toLowerCase()}`}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-card ${breakpoint === "md" ? "md:hidden" : "lg:hidden"}`}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent className="mobile-navigation flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 pb-5 pt-7 text-left">
          <SheetTitle className="pr-12">{label}</SheetTitle>
          <SheetDescription>Mithaq · Meet haq in marriage</SheetDescription>
        </SheetHeader>
        <nav
          aria-label={label}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {children}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
