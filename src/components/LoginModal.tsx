import { useState } from "react";
import { LogIn, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 可自訂提示文字，例如「儲存分析結果需要登入」 */
  reason?: string;
}

/**
 * Google 登入 Modal
 *
 * 在用戶嘗試儲存資料但尚未登入時彈出。
 * 成功登入後，Supabase 會 redirect 至 /auth/callback，
 * 再由 callback 頁重新導回原本的頁面。
 */
export function LoginModal({ open, onOpenChange, reason }: LoginModalProps) {
  const { signInWithGoogle } = useAuth();
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleGoogleLogin() {
    try {
      setIsPending(true);
      setErrorMsg(null);
      await signInWithGoogle();
      // signInWithGoogle 會導向 Google，此行通常不會執行
    } catch (err) {
      setErrorMsg("登入時發生錯誤，請稍後再試。");
      console.error(err);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-card p-8 shadow-xl">
        {/* 關閉按鈕 */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="關閉"
        >
          <X size={16} />
        </button>

        <DialogHeader className="text-center">
          {/* 印章裝飾 */}
          <div className="mb-4 flex justify-center">
            <span className="seal-stamp text-2xl">登</span>
          </div>
          <DialogTitle className="font-display text-2xl text-foreground">
            登入以儲存紀錄
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {reason ?? "登入後，每日舌診結果將自動同步至雲端，隨時追蹤健康變化趨勢。"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-3">
          {/* Google 登入按鈕 */}
          <Button
            onClick={handleGoogleLogin}
            disabled={isPending}
            className="w-full gap-3 rounded-full bg-foreground py-5 text-background hover:opacity-90"
          >
            {isPending ? (
              <span className="animate-spin">⏳</span>
            ) : (
              /* Google G 圖示 SVG */
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                />
              </svg>
            )}
            使用 Google 帳號登入
          </Button>

          {/* 錯誤訊息 */}
          {errorMsg && <p className="text-center text-xs text-destructive">{errorMsg}</p>}

          {/* 隱私說明 */}
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground/70">
            登入即表示同意本系統蒐集您的健康記錄作為個人追蹤用途。
            <br />
            資料不作任何商業用途，並受 Supabase RLS 保護。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
