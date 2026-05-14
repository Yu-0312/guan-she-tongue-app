import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  head: () => ({
    meta: [{ title: "登入中… · 觀舌" }],
  }),
});

/**
 * Google OAuth Callback 頁
 *
 * Google 完成授權後會 redirect 到此頁（帶 code 或 hash fragment）。
 * Supabase 會自動從 URL 取出 token 並建立 session。
 * 完成後導回首頁（或登入前的頁面）。
 */
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function handleCallback() {
      try {
        // Supabase 會自動解析 URL 中的 code/hash，交換為 session
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
          if (isMounted) setStatus("success");

          // 取得 login 前記錄的 returnTo 路徑（若有），否則回首頁
          const returnTo =
            (typeof sessionStorage !== "undefined" &&
              sessionStorage.getItem("auth:return_to")) ||
            "/";
          sessionStorage.removeItem("auth:return_to");

          setTimeout(() => {
            if (isMounted) void navigate({ to: returnTo as "/" });
          }, 800);
        } else {
          // 沒有 session：可能是直接訪問此頁，導回首頁
          if (isMounted) void navigate({ to: "/" });
        }
      } catch (err) {
        console.error("[auth/callback]", err);
        if (isMounted) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "登入失敗，請重試。");
        }
      }
    }

    void handleCallback();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      {status === "loading" && (
        <>
          <span className="seal-stamp animate-pulse text-4xl">登</span>
          <p className="text-sm text-muted-foreground">驗證中，請稍候……</p>
        </>
      )}

      {status === "success" && (
        <>
          <span className="seal-stamp text-4xl">✓</span>
          <p className="font-display text-lg text-foreground">登入成功</p>
          <p className="text-sm text-muted-foreground">正在為您導回……</p>
        </>
      )}

      {status === "error" && (
        <>
          <span className="seal-stamp text-4xl">✕</span>
          <p className="font-display text-lg text-foreground">登入失敗</p>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <a
            href="/"
            className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            回首頁
          </a>
        </>
      )}
    </div>
  );
}
