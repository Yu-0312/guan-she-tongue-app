import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2, WandSparkles } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Disclaimer } from "@/components/Disclaimer";
import {
  TONGUE_OPTIONS,
  defaultTongueObservation,
  type ConstitutionResult,
  type TongueCapture,
  type TongueFeatureKey,
  type TongueObservation,
} from "@/lib/assessment";
import { STORAGE_KEYS, loadJson, saveJson } from "@/lib/app-storage";
import {
  analyzeTongueCapture,
  confidenceLabel,
  getTonguePrediction,
  type TongueModelAnalysis,
} from "@/lib/cnn-tongue-analysis";

export const Route = createFileRoute("/capture")({
  component: CapturePage,
  head: () => ({
    meta: [
      { title: "舌診拍攝 · 觀舌" },
      { name: "description", content: "上傳或拍攝舌象，AI 即時分析。" },
    ],
  }),
});

function CapturePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [constitution] = useState<ConstitutionResult | null>(() =>
    loadJson<ConstitutionResult>(STORAGE_KEYS.constitution),
  );
  const [capture, setCapture] = useState<TongueCapture | null>(() =>
    loadJson<TongueCapture>(STORAGE_KEYS.tongueCapture),
  );
  const [observation, setObservation] = useState<TongueObservation>(
    () =>
      loadJson<TongueObservation>(STORAGE_KEYS.tongueObservation) ??
      defaultTongueObservation(constitution),
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [modelAnalysis, setModelAnalysis] = useState<TongueModelAnalysis | null>(() =>
    loadJson<TongueModelAnalysis>(STORAGE_KEYS.tongueModelAnalysis),
  );
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelAnalyzing, setModelAnalyzing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const navigate = useNavigate();

  const onFile = async (file: File) => {
    setFileError(null);

    if (!file.type.startsWith("image/")) {
      setFileError("請上傳 JPG、PNG 或手機相機拍攝的影像檔。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileError("檔案超過 10MB，請重新拍攝或壓縮後再上傳。");
      return;
    }

    try {
      const normalized = await normalizeTongueImage(file);
      const capturedAt = new Date().toISOString();
      const nextCapture: TongueCapture = {
        dataUrl: normalized.dataUrl,
        fileName: file.name || "tongue-capture.jpg",
        width: normalized.width,
        height: normalized.height,
        sizeKb: normalized.sizeKb,
        capturedAt,
      };
      const nextObservation = {
        ...observation,
        capturedAt,
      };

      setCapture(nextCapture);
      setObservation(nextObservation);
      setModelAnalysis(null);
      setModelError(null);
      void fillObservationFromModel(nextCapture, nextObservation);
    } catch {
      setFileError("影像讀取失敗，請重新選擇或拍攝一次。");
    }
  };

  const analyze = () => {
    if (!capture) return;
    setAnalyzing(true);
    saveJson(STORAGE_KEYS.tongueCapture, capture);
    saveJson(STORAGE_KEYS.tongueObservation, {
      ...observation,
      capturedAt: new Date().toISOString(),
    });
    if (modelAnalysis) {
      saveJson(STORAGE_KEYS.tongueModelAnalysis, modelAnalysis);
    }
    setTimeout(() => navigate({ to: "/results" }), 900);
  };

  const setFeature = (feature: TongueFeatureKey, value: string) => {
    setObservation((current) => ({ ...current, [feature]: value }));
  };

  const fillObservationFromModel = async (
    nextCapture: TongueCapture,
    fallback: TongueObservation,
  ) => {
    setModelAnalyzing(true);
    try {
      const analysis = await analyzeTongueCapture(nextCapture, fallback);
      setModelAnalysis(analysis);
      setObservation(analysis.observation);
      saveJson(STORAGE_KEYS.tongueModelAnalysis, analysis);
      saveJson(STORAGE_KEYS.tongueObservation, analysis.observation);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "CNN API 無法完成分析");
    } finally {
      setModelAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen paper-grain">
      <SiteNav />
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm tracking-[0.3em] text-accent uppercase">望診 · 舌象採集</p>
        <h1 className="mt-3 font-display text-4xl text-foreground">今日舌象</h1>
        <p className="mt-4 text-muted-foreground">
          建議於晨起、未進食前，於自然光下拍攝。盡量伸舌自然，避免用力。
        </p>

        {!constitution && (
          <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-5 py-4 text-sm text-muted-foreground">
            尚未建立體質基線。你仍可先拍攝舌象；若要取得更貼近個人的調養建議，建議先完成{" "}
            <Link to="/quiz" className="font-medium text-accent underline-offset-4 hover:underline">
              體質測驗
            </Link>
            。
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_1fr]">
          <div
            onClick={() => inputRef.current?.click()}
            className="aspect-square cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card transition hover:border-primary"
          >
            {capture ? (
              <img src={capture.dataUrl} alt="舌象預覽" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <Camera className="mx-auto mb-4 h-14 w-14 text-primary" />
                <p className="font-display text-lg text-foreground">點擊上傳或開啟相機</p>
                <p className="text-xs text-muted-foreground mt-2">支援 JPG / PNG · 最大 10MB</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>

          <div className="space-y-5">
            {capture && (
              <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">影像已標準化</p>
                    <p className="mt-1">
                      {capture.width} × {capture.height}px · 約 {capture.sizeKb}KB ·
                      僅暫存於此瀏覽器
                    </p>
                  </div>
                </div>
              </div>
            )}

            {fileError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              </div>
            )}

            {(modelAnalyzing || modelAnalysis || modelError) && (
              <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm">
                <div className="flex items-start gap-3">
                  {modelAnalyzing ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : modelError ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  )}
                  <div>
                    <p className="font-medium text-foreground">
                      {modelAnalyzing
                        ? "CNN 正在分析舌象"
                        : modelError
                          ? "CNN 分析暫時不可用"
                          : "CNN 已自動填入欄位"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {modelAnalyzing
                        ? "完成後會自動套用苔色、苔質、舌質、舌形與分區結果。"
                        : modelError
                          ? `${modelError}。你仍可手動校正後生成報告。`
                          : `整體信心 ${confidenceLabel(modelAnalysis.response.overallConfidence)} · ${modelAnalysis.response.model.id}`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-6">
              <p className="font-display text-lg text-foreground">拍攝小訣竅</p>
              <ul className="mt-3 text-sm text-muted-foreground space-y-2">
                <li>避開強烈黃光或濾鏡</li>
                <li>舌頭自然伸出，不過度用力</li>
                <li>鏡頭與舌面保持 15-20 公分</li>
                <li>拍攝前一小時內勿飲色素飲品</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-start gap-3">
                <WandSparkles className="mt-1 h-5 w-5 text-accent" />
                <div>
                  <p className="font-display text-lg text-foreground">舌象判讀校正</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    上傳後會依 CNN API 回傳格式自動填入；若光線或角度影響判讀，可在此手動修正。
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {(Object.keys(TONGUE_OPTIONS) as TongueFeatureKey[]).map((feature) => (
                  <div key={feature}>
                    <div className="mb-2 flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {TONGUE_OPTIONS[feature].label}
                      </p>
                      {getTonguePrediction(modelAnalysis, feature) && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] text-primary">
                          CNN{" "}
                          {confidenceLabel(getTonguePrediction(modelAnalysis, feature)!.confidence)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {TONGUE_OPTIONS[feature].options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFeature(feature, option.value)}
                          className={`rounded-lg border px-3 py-2 text-sm transition ${
                            observation[feature] === option.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:border-primary/50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              disabled={!capture || analyzing || modelAnalyzing}
              onClick={analyze}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-medium text-primary-foreground transition disabled:opacity-40"
            >
              {analyzing && <Loader2 className="h-4 w-4 animate-spin" />}
              {analyzing
                ? "正在生成今日報告..."
                : modelAnalyzing
                  ? "等待 CNN 分析..."
                  : "生成今日分析"}
            </button>

            <Disclaimer />
          </div>
        </div>
      </div>
      <Disclaimer variant="footer" />
    </div>
  );
}

async function normalizeTongueImage(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number; sizeKb: number }> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.filter = "saturate(1.03) contrast(1.04) brightness(1.02)";
  context.drawImage(image, 0, 0, width, height);

  const normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.86);
  return {
    dataUrl: normalizedDataUrl,
    width,
    height,
    sizeKb: Math.round((normalizedDataUrl.length * 3) / 4 / 1024),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}
