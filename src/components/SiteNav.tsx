import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, Flame } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDailyCheckin } from "@/hooks/use-daily-checkin";
import { LazyLoginModal } from "./LazyLoginModal";

export function SiteNav() {
  const { user, signOut, isLoading } = useAuth();
  const { streakDays } = useDailyCheckin();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const links = [
    { to: "/", label: "首頁" },
    { to: "/quiz", label: "體質測驗" },
    { to: "/capture", label: "舌診拍攝" },
    { to: "/results", label: "分析結果" },
    { to: "/about", label: "關於" },
  ] as const;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <span className="seal-stamp text-sm">望</span>
            <span className="font-display text-xl tracking-wide text-foreground">
              觀舌 <span className="text-muted-foreground text-sm">· Guān Shé</span>
            </span>
          </Link>

          {/* 導覽連結 */}
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

          {/* 右側：用戶區塊 */}
          <div className="flex items-center gap-3">
            {/* 連續打卡天數（登入後顯示） */}
            {user && streakDays > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent"
                title={`已連續打卡 ${streakDays} 天`}
              >
                <Flame size={12} className="shrink-0" />
                <span className="font-medium">{streakDays}</span>
              </div>
            )}

            {!isLoading && !user ? (
              /* ── 未登入：顯示登入按鈕 ── */
              <button
                onClick={() => setLoginModalOpen(true)}
                className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
              >
                <LogIn size={14} />
                登入
              </button>
            ) : user ? (
              /* ── 已登入：顯示頭像 + 登出 ── */
              <div className="flex items-center gap-2">
                {/* 用戶頭像 */}
                <div className="relative">
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url as string}
                      alt={(user.user_metadata?.full_name as string) ?? "用戶"}
                      className="h-8 w-8 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-xs font-medium text-foreground">
                      {((user.user_metadata?.full_name as string) ??
                        user.email ??
                        "?")[0].toUpperCase()}
                    </div>
                  )}
                  {/* 今日已打卡綠點 */}
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500"
                    title="今日已打卡"
                  />
                </div>

                {/* 登出按鈕 */}
                <button
                  onClick={() => void signOut()}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  title="登出"
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">登出</span>
                </button>
              </div>
            ) : null}

            {/* 每日一拍主要按鈕（永遠顯示） */}
            <Link
              to="/capture"
              className="hidden rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 sm:block"
            >
              每日一拍
            </Link>
          </div>
        </nav>
      </header>

      {/* 登入 Modal */}
      <LazyLoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />
    </>
  );
}
