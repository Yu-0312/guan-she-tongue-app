import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Disclaimer } from "@/components/Disclaimer";
import {
  QUIZ_QUESTIONS,
  SCALE,
  calculateConstitution,
  type ConstitutionResult,
} from "@/lib/assessment";
import { STORAGE_KEYS, loadJson, removeStored, saveJson } from "@/lib/app-storage";

export const Route = createFileRoute("/quiz")({
  component: QuizPage,
  head: () => ({
    meta: [
      { title: "體質測驗 · 觀舌" },
      { name: "description", content: "中醫九種體質測驗，建立你的健康基線。" },
    ],
  }),
});

function QuizPage() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ConstitutionResult | null>(() =>
    loadJson<ConstitutionResult>(STORAGE_KEYS.constitution),
  );
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / QUIZ_QUESTIONS.length) * 100;
  const isComplete = answeredCount === QUIZ_QUESTIONS.length;

  const submit = () => {
    const nextResult = calculateConstitution(answers);
    saveJson(STORAGE_KEYS.constitution, nextResult);
    setResult(nextResult);
  };

  const retake = () => {
    removeStored(STORAGE_KEYS.constitution);
    setAnswers({});
    setResult(null);
  };

  return (
    <div className="min-h-screen paper-grain">
      <SiteNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm tracking-[0.3em] text-accent uppercase">問卷 · 體質辨識</p>
        <h1 className="mt-3 font-display text-4xl text-foreground">中醫九種體質測驗</h1>
        <p className="mt-4 text-muted-foreground">
          請依近三個月的真實感受作答。結果會作為後續舌象建議的個人體質基線。
        </p>

        <div className="mt-8 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            已完成 {answeredCount} / {QUIZ_QUESTIONS.length}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>

        {!result ? (
          <div className="mt-10 space-y-6">
            {QUIZ_QUESTIONS.map((question, i) => (
              <div key={question.id} className="rounded-xl border border-border bg-card p-6">
                <p className="font-display text-lg text-foreground">
                  <span className="text-accent mr-2">{i + 1}.</span>
                  {question.text}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {SCALE.map((scale) => (
                    <button
                      key={scale.value}
                      onClick={() => setAnswers({ ...answers, [question.id]: scale.value })}
                      className={`rounded-lg border px-3 py-3 text-sm transition ${
                        answers[question.id] === scale.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      {scale.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              disabled={!isComplete}
              onClick={submit}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-medium text-primary-foreground transition disabled:opacity-40"
            >
              提交並查看體質結果
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-paper)]">
            <div className="flex items-center gap-4">
              <span className="seal-stamp">{result.primary.shortLabel}</span>
              <div>
                <p className="text-sm text-muted-foreground">您的主要體質傾向</p>
                <h2 className="font-display text-2xl text-foreground">
                  {result.primary.label}
                  {result.secondary.length > 0 && (
                    <span className="text-base text-muted-foreground">
                      {" "}
                      兼 {result.secondary.map((item) => item.shortLabel).join("、")}
                    </span>
                  )}
                </h2>
              </div>
            </div>
            <div className="ink-divider my-6" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {result.primary.summary}
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {result.primary.careFocus}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {result.scores.slice(0, 6).map((score) => (
                <div
                  key={score.key}
                  className="rounded-lg border border-border bg-background px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-display text-foreground">{score.label}</span>
                    <span className="text-muted-foreground">{score.score}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${score.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg bg-secondary/70 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{result.primary.morningTip}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/capture"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm text-accent-foreground"
              >
                下一步：進行舌診拍攝
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={retake}
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm text-foreground"
              >
                <RotateCcw className="h-4 w-4" />
                重新測驗
              </button>
            </div>
          </div>
        )}

        <div className="mt-10">
          <Disclaimer />
        </div>
      </div>
      <Disclaimer variant="footer" />
    </div>
  );
}
