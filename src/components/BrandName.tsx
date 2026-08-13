export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold ${className}`} aria-label="Mithaq">
      <span className="text-primary">Mithaq</span>
    </span>
  );
}
