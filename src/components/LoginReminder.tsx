import { useState } from "react";
import { CloudOff, LogIn, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { LoginModal } from "./LoginModal";

/**
 * 未登入提醒條（sticky banner）
 *
 * 在 capture / results 等需要儲存資料的頁面底部顯示。
 * 用戶可以關閉它（本次 session 內不再顯示），或直接點擊登入。
 */
export function LoginReminder({ reason }: { reason?: string }) {
  const { user, isLoading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // 已登入或載入中或已關閉 → 不顯示
  if (isLoading || user || dismissed) return null;

  return (
    <>
      <div
        role="alert"
        aria-live="polite"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-accent/30 bg-background/95 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          {/* 左側說明 */}
          <div className="flex items-center gap-3 text-sm">
            <CloudOff size={16} className="shrink-0 text-accent" />
            <span className="text-muted-foreground">
              {reason ?? "目前以訪客模式瀏覽，分析結果僅存在本機。"}
              <span className="ml-1 text-foreground">登入後可同步至雲端，追蹤每日紀錄。</span>
            </span>
          </div>

          {/* 右側操作 */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <LogIn size={13} />
              登入
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="關閉提醒"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 登入 Modal */}
      <LoginModal open={modalOpen} onOpenChange={setModalOpen} reason={reason} />
    </>
  );
}

/**
 * 僅渲染 Modal（不含底部提示條），供按鈕觸發使用
 */
export function LoginModalTrigger({
  children,
  reason,
}: {
  children: (open: () => void) => React.ReactNode;
  reason?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      {children(() => setModalOpen(true))}
      <LoginModal open={modalOpen} onOpenChange={setModalOpen} reason={reason} />
    </>
  );
}
