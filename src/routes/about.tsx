import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "關於觀舌 · 系統架構與願景" },
      { name: "description", content: "觀舌的設計理念、技術架構與發展藍圖。" },
    ],
  }),
});

function AboutPage() {
  return (
    <div className="min-h-screen paper-grain">
      <SiteNav />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm tracking-[0.3em] text-accent uppercase">About</p>
        <h1 className="mt-3 font-display text-4xl text-foreground">關於觀舌</h1>

        <div className="mt-10 space-y-10 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="font-display text-2xl">我們相信的事</h2>
            <p className="mt-3 text-muted-foreground">
              中醫望聞問切是完整的診斷之道，缺一不可。然現世代人於繁忙之中，鮮少為小症狀停留。
              觀舌願做那一道防線——在病未成形之時，先一步察覺，先一步調養。
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl">系統架構</h2>
            <ul className="mt-3 space-y-3 text-muted-foreground">
              <li>
                <b className="text-foreground">前端：</b>
                網頁應用，手機與電腦皆可拍攝、上傳並查看結果。亦提供 App 下載入口。
              </li>
              <li>
                <b className="text-foreground">後端：</b>影像進入後做尺寸標準化與光線校正，再交由
                CNN 模型進行特徵擷取與分類。
              </li>
              <li>
                <b className="text-foreground">資料：</b>Supabase
                提供資料庫、身份驗證與存取控制，確保健康資料安全。
              </li>
              <li>
                <b className="text-foreground">模組化：</b>
                影像分析、資料儲存、建議生成三大模組獨立運作，方便擴充與維護。
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl">發展藍圖</h2>
            <ol className="mt-3 space-y-2 text-muted-foreground list-decimal pl-5">
              <li>初期：體質問卷 + 舌診（現階段）</li>
              <li>下階段：加入面容辨識，與舌診相輔相成</li>
              <li>再後：語音／聲紋分析，拓展至聞診</li>
              <li>遠期：問診對話，集望聞問三診於一</li>
            </ol>
          </section>

          <Disclaimer />
        </div>
      </article>
      <Disclaimer variant="footer" />
    </div>
  );
}
