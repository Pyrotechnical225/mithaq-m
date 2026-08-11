export function SiteFooter() {
  return (
    <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
      <p className="font-arabic text-lg text-primary">بسم الله</p>
      <p className="mt-2">© {new Date().getFullYear()} MeetHaq. Marriage is half of your deen.</p>
    </footer>
  );
}
