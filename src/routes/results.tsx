import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  CircleHelp,
  Cloud,
  CloudOff,
  ShieldAlert,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Disclaimer } from "@/components/Disclaimer";
import { LoginReminder, LoginModalTrigger } from "@/components/LoginReminder";
import {
  buildTongueReport,
  defaultTongueObservation,
  type ConstitutionResult,
  type TongueCapture,
  type TongueObservation,
} from "@/lib/assessment";
import { STORAGE_KEYS, loadJson } from "@/lib/app-storage";
import {
  confidenceLabel,
  type CnnTongueFeaturePrediction,
  type TongueModelAnalysis,
} from "@/lib/cnn-tongue-analysis";
import { useAuth } from "@/lib/auth-context";
import { saveHealthRecord } from "@/hooks/use-daily-checkin";

export const Route = createFileRoute("/results")({
  component: ResultsPage,
  head: () => ({
    meta: [
      { title: "分析結果 · 觀舌" },
      { name: "description", content: "今日舌象分析與調養建議。" },
    ],
  }),
});

// ── 同步狀態型別 ────────────────────────────────────────────────────────────
type SyncStatus = "idle" | "syncing" | "synced" | "error";

function ResultsPage() {
  const { user } = useAuth();
  const [{ constitution, capture, modelAnalysis, observation }] = useState(() => {
    const storedConstitution = loadJson<ConstitutionResult>(STORAGE_KEYS.constitution);

    return {
      constitution: storedConstitution,
      capture: loadJson<TongueCapture>(STORAGE_KEYS.tongueCapture),
      modelAnalysis: loadJson<TongueModelAnalysis>(STORAGE_KEYS.tongueModelAnalysis),
      observation:
        loadJson<TongueObservation>(STORAGE_KEYS.tongueObservation) ??
        defaultTongueObservation(storedConstitution),
    };
  });
  const report = useMemo(
    () => buildTongueReport(observation, constitution),
    [constitution, observation],
  );
  const dateLabel = useMemo(() => formatDate(observation.capturedAt), [observation.capturedAt]);
  const cautionCount = useMemo(
    () => report.findings.filter((finding) => finding.level === "caution").length,
    [report],
  );
  const syncPayload = useMemo(() => {
    const preds = modelAnalysis?.predictions;
    const predictionValues: CnnTongueFeaturePrediction[] = preds
      ? Object.values(preds).filter((prediction): prediction is CnnTongueFeaturePrediction =>
          Boolean(prediction),
        )
      : [];
    const avgConfidence =
      predictionValues.length > 0
        ? predictionValues.reduce((sum, prediction) => sum + prediction.confidence, 0) /
          predictionValues.length
        : undefined;

    return {
      tongueImageBase64: capture?.dataUrl,
      tongueColor: preds?.bodyColor?.value ?? observation.bodyColor,
      coatingType: preds?.coatingColor?.value ?? observation.coatingColor,
      coatingThickness: preds?.coatingTexture?.value ?? observation.coatingTexture,
      moisture: observation.center,
      cnnConfidence: avgConfidence,
      rawLogits: preds
        ? Object.fromEntries(
            Object.entries(preds).map(([key, prediction]) => [key, prediction?.confidence ?? 0]),
          )
        : undefined,
      constitutionType: constitution?.primary?.key,
    };
  }, [capture, constitution, modelAnalysis, observation]);

  // ── 雲端同步狀態 ─────────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const syncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      syncedUserRef.current = null;
      setSyncStatus("idle");
      return;
    }
    if (syncedUserRef.current === user.id) return;

    syncedUserRef.current = user.id;
    setSyncStatus("syncing");
    let cancelled = false;

    void saveHealthRecord(user.id, syncPayload)
      .then((result) => {
        if (!cancelled) {
          setSyncStatus(result ? "synced" : "error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSyncStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [syncPayload, user?.id]);

  return (
    <div className="min-h-screen paper-grain">
      <SiteNav />
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-sm tracking-[0.3em] text-accent uppercase">今日報告 · {dateLabel}</p>
        <h1 className="mt-3 font-display text-4xl text-foreground">舌象分析</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          本報告以今日舌象觀察搭配
          {constitution ? `「${constitution.primary.label}」體質基線` : "尚未建立的體質基線"}
          生成，適合作為日常調養與自我觀察參考。
        </p>

        {!capture && (
          <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-5 py-4 text-sm text-muted-foreground">
            尚未找到今日拍攝影像。你可以先查看示範報告，也可以前往{" "}
            <Link
              to="/capture"
              className="font-medium text-accent underline-offset-4 hover:underline"
            >
              舌診拍攝
            </Link>
            重新建立今日資料。
          </div>
        )}

        <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-paper)]">
            <div className="aspect-square overflow-hidden rounded-xl bg-secondary">
              {capture ? (
                <img src={capture.dataUrl} alt="今日舌象" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-7xl">舌</div>
              )}
            </div>
            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <span className="font-display text-foreground">綜合判讀</span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {constitution ? `${constitution.primary.shortLabel}體質基線` : "建議完成體質問卷"}
                </p>
              </div>
              <span className="seal-stamp text-[0.7rem]">
                {report.patternTags.slice(0, 2).join(" · ")}
              </span>
            </div>

            {/* ── 雲端同步狀態 ── */}
            <div className="mt-4">
              <SyncStatusBadge status={syncStatus} isLoggedIn={!!user} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-secondary/70 px-4 py-3">
                <p className="text-xs text-muted-foreground">需留意項</p>
                <p className="mt-1 font-display text-lg text-foreground">{cautionCount}</p>
              </div>
              <div className="rounded-lg bg-secondary/70 px-4 py-3">
                <p className="text-xs text-muted-foreground">資料來源</p>
                <p className="mt-1 font-display text-lg text-foreground">
                  {modelAnalysis
                    ? `CNN ${confidenceLabel(modelAnalysis.response.overallConfidence)}`
                    : "本機暫存"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {report.findings.map((finding) => (
              <div
                key={finding.label}
                className="rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-14 font-display text-sm text-muted-foreground">
                    {finding.label}
                  </div>
                  <div className="font-display text-lg text-foreground">{finding.value}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${levelClass(finding.level)}`}>
                    {levelText(finding.level)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{finding.note}</p>
              </div>
            ))}
          </div>
        </div>

        <section className="mt-12">
          <h2 className="font-display text-2xl text-foreground">今日宜忌</h2>
          <div className="ink-divider my-5 w-24" />
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { c: "宜食", color: "text-primary", items: report.foods },
              { c: "宜飲", color: "text-primary", items: report.drinks },
              { c: "宜避", color: "text-destructive", items: report.avoid },
            ].map((s) => (
              <div key={s.c} className="rounded-xl border border-border bg-card p-6">
                <p className={`font-display text-lg ${s.color}`}>{s.c}</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-7">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <p className="font-display text-lg text-foreground">起居提醒</p>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {report.routines.map((routine) => (
                <li key={routine}>{routine}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-7">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <p className="font-display text-lg text-foreground">注意與警訊</p>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {report.watches.map((watch) => (
                <li key={watch}>{watch}</li>
              ))}
            </ul>
          </section>
        </div>

        {constitution ? (
          <section className="mt-10 rounded-2xl border border-border bg-card p-7">
            <p className="font-display text-lg text-foreground">體質基線參照</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {constitution.primary.summary}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {constitution.primary.careFocus}
            </p>
          </section>
        ) : (
          <section className="mt-10 rounded-2xl border border-border bg-card p-7">
            <div className="flex items-start gap-3">
              <CircleHelp className="mt-1 h-5 w-5 text-accent" />
              <div>
                <p className="font-display text-lg text-foreground">補上體質問卷後，建議會更準</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  同樣是舌尖偏紅，若合併陰虛、氣鬱或濕熱體質，調養方向會不同。建議先完成體質測驗，再回來拍攝舌象。
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 rounded-xl border border-accent/30 bg-accent/10 px-5 py-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              舌象受光線、飲食、睡眠、口腔狀態與拍攝角度影響很大。建議連續記錄趨勢，不以單次結果作醫療判斷。
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/capture"
            className="rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground"
          >
            重新拍攝
          </Link>
          <Link to="/quiz" className="rounded-full border border-border px-6 py-3 text-sm">
            更新體質測驗
          </Link>
          <Link to="/" className="rounded-full border border-border px-6 py-3 text-sm">
            返回首頁
          </Link>
        </div>

        <div className="mt-10">
          <Disclaimer />
        </div>
      </div>
      <Disclaimer variant="footer" />

      {/* ── 未登入提醒條（固定於底部） ── */}
      <LoginReminder reason="登入後，每日舌診結果將自動同步至雲端，追蹤健康趨勢。" />
    </div>
  );
}

// ── 同步狀態 Badge ──────────────────────────────────────────────────────────
function SyncStatusBadge({ status, isLoggedIn }: { status: SyncStatus; isLoggedIn: boolean }) {
  if (!isLoggedIn) {
    return (
      <LoginModalTrigger reason="登入後，今日結果將自動儲存至雲端，建立長期健康記錄。">
        {(open) => (
          <button
            onClick={open}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/30 py-2.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <CloudOff size={13} />
            訪客模式・點此登入以儲存雲端
          </button>
        )}
      </LoginModalTrigger>
    );
  }

  if (status === "syncing") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Cloud size={13} className="animate-pulse" />
        正在同步至雲端……
      </div>
    );
  }

  if (status === "synced") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2.5 text-xs text-green-600">
        <Cloud size={13} />
        已同步至雲端 ✓
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
        <CloudOff size={13} />
        同步失敗，資料保留在本機
      </div>
    );
  }

  return null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("zh-TW");
  }
  return date.toLocaleDateString("zh-TW");
}

function levelText(level: "stable" | "attention" | "caution") {
  if (level === "stable") return "平穩";
  if (level === "attention") return "留意";
  return "警訊";
}

function levelClass(level: "stable" | "attention" | "caution") {
  if (level === "stable") return "bg-primary/10 text-primary";
  if (level === "attention") return "bg-accent/10 text-accent";
  return "bg-destructive/10 text-destructive";
}
