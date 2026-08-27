export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-sans font-semibold tracking-[-0.035em] ${className}`}
      aria-label="Mithaq"
    >
      <span className="text-foreground">Mithaq</span>
    </span>
  );
}
