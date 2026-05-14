# 觀舌 · Guan She

> 每日一拍，讓舌頭替你說話。

結合中醫望診智慧與 AI 影像辨識的舌象分析 Web App。晨起三十秒拍舌，AI 對照體質問卷結果，給出今日飲食、起居建議。

**Live demo:** https://yu-0312.github.io/guan-she-tongue-app/

---

## 技術架構

| 層 | 技術 |
|---|---|
| 前端 | React 19 · TanStack Router · TailwindCSS v4 · shadcn/ui |
| 建置 | Vite · TanStack Start (SSG 靜態預渲染) |
| ML 後端 | Python · EfficientNet-B3 / MobileNetV3 · FastAPI |
| 資料庫 | Supabase (PostgreSQL + Storage) |
| 部署 | GitHub Pages (前端) |

---

## 快速開始（前端）

```bash
# 安裝依賴
bun install

# 開發伺服器
bun run dev

# 靜態建置（預渲染所有路由）
bun run build

# 預覽建置結果
bun run preview
```

---

## 專案結構

```
.
├── src/
│   ├── routes/          # 頁面路由（TanStack Router）
│   │   ├── index.tsx    # 首頁
│   │   ├── quiz.tsx     # 體質問卷
│   │   ├── capture.tsx  # 拍攝舌象
│   │   ├── results.tsx  # 分析結果
│   │   └── about.tsx    # 關於
│   ├── components/      # 共用元件
│   └── lib/             # 工具函式、型別
├── ml/                  # Python ML 後端（見 ml/README.md）
│   ├── requirements.txt
│   └── README.md
├── scripts/
│   └── create-file-page.mjs  # SSG 靜態頁面產生器
└── .github/
    └── workflows/
        └── deploy-pages.yml  # GitHub Pages 自動部署
```

---

## ML 後端

舌象辨識採用 EfficientNet-B3 CNN，辨識 8 大類別：
`normal` · `white_coat` · `yellow_coat` · `red_tongue` · `pale_tongue` · `greasy_coat` · `thick_coat` · `thin_coat`

詳細訓練流程、FastAPI 部署與 Supabase schema 請見 [ml/README.md](ml/README.md)。

---

## GitHub Pages 部署

推送至 `main` branch 後，GitHub Actions 會自動：

1. 安裝依賴（Bun）
2. `bun run build` — Vite 建置 + SSG 預渲染每條路由
3. 上傳 `dist/client/` 至 GitHub Pages

設定位置：`.github/workflows/deploy-pages.yml`

---

## 免責聲明

本應用程式僅供健康參考，不構成醫療診斷或治療建議。如有健康疑慮，請諮詢合格中西醫師。
