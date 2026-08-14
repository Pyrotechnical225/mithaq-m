/**
 * The wordmark. "Mithaq" (ميثاق — covenant) is a single word, so it is set
 * solid rather than split into two tones the way the old "Meet"+"Haq" lockup
 * was; a two-colour break inside one word reads as an accident.
 */
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold text-primary ${className}`} aria-label="Mithaq">
      Mithaq
    </span>
  );
}
