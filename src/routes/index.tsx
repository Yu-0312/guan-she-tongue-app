import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen paper-grain">
      <SiteNav />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24">
        <div className="grid gap-14 md:grid-cols-[1.1fr_0.9fr] items-center">
          <div>
            <p className="text-sm tracking-[0.3em] text-accent uppercase mb-6">望 · 聞 · 問 · 切</p>
            <h1 className="font-display text-5xl md:text-6xl leading-tight text-foreground">
              每日一拍，
              <br />讓<span className="text-primary">舌頭</span>替你說話。
            </h1>
            <p className="mt-6 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
              繁忙之中，蛛絲馬跡常被忽略。觀舌結合中醫望診智慧與 AI 影像辨識，
              在你刷牙之前的三十秒，讀懂今日的身體訊號，給予恰到好處的飲食、起居建議。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/quiz"
                className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[var(--shadow-paper)] hover:opacity-90 transition"
              >
                開始體質測驗
              </Link>
              <Link
                to="/capture"
                className="rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary transition"
              >
                直接拍攝舌象 →
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              <span>✓ 三秒上傳</span>
              <span>✓ 即時建議</span>
              <span>✓ 資料加密</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -top-4 -right-4 seal-stamp">觀舌</div>
            <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-paper)]">
              <div className="aspect-square rounded-xl bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                <div className="text-center">
                  <div className="text-7xl mb-4">👅</div>
                  <p className="font-display text-foreground">今日舌象</p>
                  <p className="text-xs text-muted-foreground mt-1">點擊上傳或開啟相機</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                {[
                  { k: "苔色", v: "薄白" },
                  { k: "舌質", v: "淡紅" },
                  { k: "體質", v: "平和" },
                ].map((i) => (
                  <div key={i.k} className="rounded-lg bg-secondary/60 py-3">
                    <p className="text-xs text-muted-foreground">{i.k}</p>
                    <p className="font-display text-sm text-foreground mt-1">{i.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl text-foreground text-center">三步守衛第一道防線</h2>
          <div className="ink-divider my-10 mx-auto w-32" />
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                n: "壹",
                t: "辨體質",
                d: "完成簡短問卷，建立你的中醫體質基線：平和、氣虛、陽虛、陰虛、痰濕、濕熱、血瘀、氣鬱、特稟。",
              },
              {
                n: "貳",
                t: "拍舌象",
                d: "每日晨起，自然光下對著鏡頭伸舌三秒。系統自動校正光線與尺寸。",
              },
              {
                n: "參",
                t: "得建議",
                d: "AI 比對苔色、舌質、舌形與你的體質，給出今日宜飲、宜食、宜避免的具體提醒。",
              },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-border bg-card p-7">
                <div className="font-display text-3xl text-accent">{s.n}</div>
                <h3 className="mt-3 font-display text-xl text-foreground">{s.t}</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reading the tongue */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <p className="text-sm tracking-[0.3em] text-accent uppercase mb-4">舌診地圖</p>
            <h2 className="font-display text-3xl text-foreground">一條舌頭，五臟六腑的縮影</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              舌尖映心肺、舌邊應肝膽、中央屬脾胃、舌根候腎。
              苔色之白紅、苔質之厚薄膩腐，皆是身體未語先言的暗號。
            </p>
          </div>
          <ul className="space-y-3">
            {[
              ["舌尖紅", "心火盛 — 推薦蓮子心飲、減少熬夜"],
              ["苔白厚", "虛寒或痰濕 — 宜溫食、避生冷"],
              ["苔黃膩", "濕熱內蘊 — 清淡飲食、薏仁赤小豆"],
              ["舌邊齒痕", "脾虛濕重 — 山藥四神為佳"],
              ["舌質紫黯", "氣血瘀滯 — 適度活動、玫瑰花茶"],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-4 rounded-lg border border-border bg-card px-5 py-4">
                <span className="font-display text-primary min-w-[5rem]">{k}</span>
                <span className="text-sm text-muted-foreground">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Roadmap */}
      <section className="bg-card/40 border-y border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl text-foreground">願景 · 集望聞問三診於一</h2>
          <div className="mt-10 grid md:grid-cols-4 gap-5">
            {[
              { p: "現階段", t: "望診 · 舌象", s: "已上線" },
              { p: "下一階", t: "望診 · 面容", s: "開發中" },
              { p: "再後", t: "聞診 · 聲紋", s: "規劃中" },
              { p: "終階", t: "問診 · 對話", s: "規劃中" },
            ].map((r) => (
              <div key={r.t} className="rounded-xl border border-border bg-background p-6">
                <p className="text-xs tracking-widest text-accent uppercase">{r.p}</p>
                <p className="font-display text-lg text-foreground mt-2">{r.t}</p>
                <p className="text-xs text-muted-foreground mt-3">{r.s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <Disclaimer />
      </section>

      <Disclaimer variant="footer" />
    </div>
  );
}
