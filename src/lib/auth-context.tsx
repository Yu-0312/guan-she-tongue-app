import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

interface AuthActions {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

type AuthContextValue = AuthState & AuthActions;

function getAuthCallbackUrl() {
  if (typeof window === "undefined") {
    return "/auth/callback";
  }

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const basePath =
    baseUrl === "/" || baseUrl === "./" ? "" : `/${baseUrl.replace(/^\/+|\/+$/g, "")}`;

  return `${window.location.origin}${basePath}/auth/callback`;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

async function getSupabase() {
  const { supabase } = await import("./supabase");
  return supabase;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void getSupabase()
      .then((supabase) => {
        if (cancelled) return;

        // 初始化：取得現有 session（瀏覽器已保存的登入狀態）
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (cancelled) return;

          setState({
            user: session?.user ?? null,
            session,
            isLoading: false,
          });
        });

        // 監聽登入狀態變化（登入、登出、token 刷新）
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (cancelled) return;

          setState({
            user: session?.user ?? null,
            session,
            isLoading: false,
          });
        });

        unsubscribe = () => subscription.unsubscribe();
      })
      .catch((error) => {
        console.error("[auth] 初始化失敗：", error);
        if (!cancelled) {
          setState({ user: null, session: null, isLoading: false });
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Google OAuth 登入：導向 Google 授權頁，完成後 redirect 回 /auth/callback
  const signInWithGoogle = useCallback(async () => {
    const supabase = await getSupabase();
    const redirectTo = getAuthCallbackUrl();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          // 強制每次都顯示帳號選擇畫面，方便多帳號用戶切換
          prompt: "select_account",
        },
      },
    });

    if (error) {
      console.error("[auth] Google 登入失敗：", error.message);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[auth] 登出失敗：", error.message);
      throw error;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必須在 <AuthProvider> 內部使用");
  }
  return ctx;
}
