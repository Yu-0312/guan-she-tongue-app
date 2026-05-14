export function Disclaimer({ variant = "inline" }: { variant?: "inline" | "footer" }) {
  if (variant === "footer") {
    return (
      <footer className="border-t border-border/60 bg-card/50 mt-24">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground space-y-3">
          <p className="font-display text-base text-foreground">免責聲明</p>
          <p>
            本系統僅供個人健康參考，不具醫療診斷功能。所有建議不能取代專業醫師意見，
            身體不適請立即就醫。
          </p>
          <p className="text-xs opacity-70">
            © {new Date().getFullYear()} 觀舌 Guān Shé · 望聞問切，始於一拍。
          </p>
        </div>
      </footer>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-secondary/60 px-4 py-3 text-xs text-muted-foreground">
      ⚠ 本系統僅供個人健康參考，不具醫療診斷功能。建議不能取代專業醫師意見，身體不適請立即就醫。
    </div>
  );
}
