import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { useDailyCheckin } from "@/hooks/use-daily-checkin";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-foreground">四〇四</h1>
        <p className="mt-4 text-muted-foreground">此頁未尋得，恐已遷徙。</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
        >
          回首頁
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-foreground">此頁未能順利顯現</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
        >
          再試一次
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "觀舌 Guān Shé · 每日一拍 守護身體第一道防線" },
      {
        name: "description",
        content: "結合中醫望診與 AI 影像分析，每日拍攝舌象，掌握身體狀態，獲得飲食與作息建議。",
      },
      { name: "author", content: "觀舌團隊" },
      { property: "og:title", content: "觀舌 Guān Shé · 每日舌診健康助手" },
      {
        property: "og:description",
        content: "AI 舌象分析 × 中醫體質辨識，為忙碌現代人守衛健康第一道防線。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700&family=Noto+Sans+TC:wght@300;400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DailyCheckinSync />
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * 靜默執行每日打卡同步
 * 用戶登入後自動在背景完成，不影響頁面 UI
 */
function DailyCheckinSync() {
  useDailyCheckin();
  return null;
}
