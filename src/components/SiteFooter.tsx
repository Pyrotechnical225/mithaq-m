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
    <footer className="border-t border-border bg-card/55">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Link to="/" className="inline-flex items-center gap-3" aria-label="Mithaq home">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-arabic text-primary-foreground">
              م
            </span>
            <BrandName className="text-2xl" />
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
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

      <div className="border-t border-border/70 px-5 py-6 text-center text-sm text-muted-foreground">
        <p className="font-arabic text-lg text-primary">بسم الله</p>
        <p className="mt-1">© {new Date().getFullYear()} Mithaq. Marriage is half of your deen.</p>
      </div>
    </footer>
  );
}
