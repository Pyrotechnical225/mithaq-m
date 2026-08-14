export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold ${className}`} aria-label="MeetHaq">
      <span className="text-azure">Meet</span>
      <span className="text-primary">Haq</span>
    </span>
  );
}
