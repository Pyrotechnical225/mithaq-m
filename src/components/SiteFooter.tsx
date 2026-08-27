import { Link } from "@tanstack/react-router";
import { BrandName } from "@/components/BrandName";

const footerLinks = [
  { href: "/#principles", label: "Our principles" },
  { href: "/#how", label: "How it works" },
  { href: "/#safety", label: "Safety" },
] as const;

const learningLinks = [
  { to: "/nikah", label: "Nikah" },
  { to: "/mahr", label: "Mahr" },
  { to: "/wali", label: "Wali" },
  { to: "/halal-relationships", label: "Halal relationships" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:px-8 lg:py-16">
        <div>
          <Link to="/" className="inline-flex items-center gap-3" aria-label="Mithaq home">
            <BrandName className="text-[1.4rem]" />
            <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
              ميثاق
            </span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">
            Meet haq in marriage through a private, respectful process supported by families and
            imams.
          </p>
        </div>

        <nav aria-label="About Mithaq">
          <p className="text-sm font-semibold text-foreground">About</p>
          <div className="mt-3 grid gap-2.5 text-sm text-muted-foreground">
            {footerLinks.map((link) => (
              <a key={link.href} href={link.href} className="w-fit hover:text-foreground">
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        <nav aria-label="Marriage guidance">
          <p className="text-sm font-semibold text-foreground">Learn</p>
          <div className="mt-3 grid gap-2.5 text-sm text-muted-foreground">
            {learningLinks.map((link) => (
              <Link key={link.to} to={link.to} className="w-fit hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <div className="border-t border-border px-5 py-5 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <p>© {new Date().getFullYear()} Mithaq.</p>
          <p>Private matchmaking. Imam-supported introductions.</p>
        </div>
      </div>
    </footer>
  );
}
