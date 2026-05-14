import { Link } from "@tanstack/react-router";

export function SiteNav() {
  const links = [
    { to: "/", label: "首頁" },
    { to: "/quiz", label: "體質測驗" },
    { to: "/capture", label: "舌診拍攝" },
    { to: "/results", label: "分析結果" },
    { to: "/about", label: "關於" },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="seal-stamp text-sm">望</span>
          <span className="font-display text-xl tracking-wide text-foreground">
            觀舌 <span className="text-muted-foreground text-sm">· Guān Shé</span>
          </span>
        </Link>
        <ul className="hidden md:flex items-center gap-7 text-sm">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          to="/capture"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          每日一拍
        </Link>
      </nav>
    </header>
  );
}
