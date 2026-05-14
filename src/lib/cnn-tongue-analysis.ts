import { z } from "zod";
import {
  TONGUE_OPTIONS,
  type TongueCapture,
  type TongueFeatureKey,
  type TongueObservation,
} from "@/lib/assessment";

export const CNN_TONGUE_SCHEMA_VERSION = "guan-she.cnn-tongue.v1" as const;
export const CNN_TONGUE_API_PATH = "/api/cnn/tongue";

export const TONGUE_FEATURE_KEYS = Object.keys(TONGUE_OPTIONS) as TongueFeatureKey[];

export type CnnTongueFeaturePrediction = {
  value: string;
  confidence: number;
  alternatives?: Array<{ value: string; confidence: number }>;
};

export type CnnTongueAnalysisRequest = {
  schemaVersion: typeof CNN_TONGUE_SCHEMA_VERSION;
  image: {
    dataUrl: string;
    fileName: string;
    width: number;
    height: number;
    sizeKb: number;
    capturedAt: string;
  };
  requestedFields: TongueFeatureKey[];
};

export type CnnTongueAnalysisResponse = {
  schemaVersion: typeof CNN_TONGUE_SCHEMA_VERSION;
  requestId?: string;
  analyzedAt: string;
  model: {
    id: string;
    version: string;
    task: "tongue-observation";
    runtime?: "python" | "edge" | "mock" | "external";
    sources?: string[];
  };
  image: {
    width: number;
    height: number;
    quality: {
      usable: boolean;
      score: number;
      issues: Array<"blur" | "tooDark" | "tooBright" | "noTongue" | "lowCoverage" | "colorCast">;
    };
  };
  segmentation?: {
    maskUrl?: string;
    bbox?: { x: number; y: number; width: number; height: number };
    tongueCoverage?: number;
  };
  predictions: Partial<Record<TongueFeatureKey, CnnTongueFeaturePrediction>>;
  overallConfidence: number;
  warnings?: string[];
};

export type TongueModelAnalysis = {
  response: CnnTongueAnalysisResponse;
  observation: TongueObservation;
  predictions: Partial<Record<TongueFeatureKey, CnnTongueFeaturePrediction>>;
  appliedAt: string;
};

const predictionSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  alternatives: z
    .array(
      z.object({
        value: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .optional(),
});

const responseSchema = z.object({
  schemaVersion: z.literal(CNN_TONGUE_SCHEMA_VERSION),
  requestId: z.string().optional(),
  analyzedAt: z.string(),
  model: z.object({
    id: z.string(),
    version: z.string(),
    task: z.literal("tongue-observation"),
    runtime: z.enum(["python", "edge", "mock", "external"]).optional(),
    sources: z.array(z.string()).optional(),
  }),
  image: z.object({
    width: z.number(),
    height: z.number(),
    quality: z.object({
      usable: z.boolean(),
      score: z.number().min(0).max(1),
      issues: z.array(
        z.enum(["blur", "tooDark", "tooBright", "noTongue", "lowCoverage", "colorCast"]),
      ),
    }),
  }),
  segmentation: z
    .object({
      maskUrl: z.string().optional(),
      bbox: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional(),
      tongueCoverage: z.number().min(0).max(1).optional(),
    })
    .optional(),
  predictions: z.record(predictionSchema),
  overallConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).optional(),
});

export function buildCnnTongueAnalysisRequest(capture: TongueCapture): CnnTongueAnalysisRequest {
  return {
    schemaVersion: CNN_TONGUE_SCHEMA_VERSION,
    image: {
      dataUrl: capture.dataUrl,
      fileName: capture.fileName,
      width: capture.width,
      height: capture.height,
      sizeKb: capture.sizeKb,
      capturedAt: capture.capturedAt,
    },
    requestedFields: TONGUE_FEATURE_KEYS,
  };
}

export async function analyzeTongueCapture(
  capture: TongueCapture,
  fallback: TongueObservation,
): Promise<TongueModelAnalysis> {
  const endpoint = getCnnEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildCnnTongueAnalysisRequest(capture)),
  });

  if (!response.ok) {
    throw new Error(`CNN API 回應失敗 (${response.status})`);
  }

  const parsed = parseCnnTongueAnalysisResponse(await response.json());
  return applyCnnTonguePredictions(parsed, fallback);
}

export function parseCnnTongueAnalysisResponse(payload: unknown): CnnTongueAnalysisResponse {
  const parsed = responseSchema.parse(payload);
  const predictions: Partial<Record<TongueFeatureKey, CnnTongueFeaturePrediction>> = {};

  for (const feature of TONGUE_FEATURE_KEYS) {
    const prediction = parsed.predictions[feature];
    if (!prediction) continue;

    if (!isValidTongueFeatureValue(feature, prediction.value)) {
      throw new Error(`CNN API returned unsupported ${feature} value: ${prediction.value}`);
    }

    predictions[feature] = {
      ...prediction,
      alternatives: prediction.alternatives?.filter((alternative) =>
        isValidTongueFeatureValue(feature, alternative.value),
      ),
    };
  }

  return {
    ...parsed,
    predictions,
  };
}

export function applyCnnTonguePredictions(
  response: CnnTongueAnalysisResponse,
  fallback: TongueObservation,
): TongueModelAnalysis {
  const observation: TongueObservation = {
    ...fallback,
    capturedAt: response.analyzedAt,
  };

  for (const feature of TONGUE_FEATURE_KEYS) {
    const prediction = response.predictions[feature];
    if (prediction) {
      observation[feature] = prediction.value;
    }
  }

  return {
    response,
    observation,
    predictions: response.predictions,
    appliedAt: new Date().toISOString(),
  };
}

export function getTonguePrediction(
  analysis: TongueModelAnalysis | null,
  feature: TongueFeatureKey,
) {
  return analysis?.predictions[feature] ?? null;
}

export function confidenceLabel(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export function makeMockCnnTongueAnalysisResponse(
  request: CnnTongueAnalysisRequest,
): CnnTongueAnalysisResponse {
  const predictions = buildDemoPredictions(request.image.dataUrl.length);
  const confidences = Object.values(predictions).map((prediction) => prediction.confidence);
  const overallConfidence =
    confidences.reduce((total, confidence) => total + confidence, 0) / confidences.length;

  return {
    schemaVersion: CNN_TONGUE_SCHEMA_VERSION,
    requestId: crypto.randomUUID(),
    analyzedAt: new Date().toISOString(),
    model: {
      id: "guan-she-cnn-contract-placeholder",
      version: "0.1.0",
      task: "tongue-observation",
      runtime: "mock",
      sources: ["TID", "BioHit", "Kaggle tooth-marked-tongue", "Roboflow Universe"],
    },
    image: {
      width: request.image.width,
      height: request.image.height,
      quality: {
        usable: true,
        score: 0.82,
        issues: [],
      },
    },
    segmentation: {
      tongueCoverage: 0.58,
    },
    predictions,
    overallConfidence,
    warnings: ["目前為 CNN API 契約用 placeholder；接上實際推論服務後請回傳同一格式。"],
  };
}

function getCnnEndpoint() {
  return import.meta.env.VITE_CNN_API_URL || CNN_TONGUE_API_PATH;
}

function isValidTongueFeatureValue(feature: TongueFeatureKey, value: string) {
  return TONGUE_OPTIONS[feature].options.some((option) => option.value === value);
}

function buildDemoPredictions(seed: number): Record<TongueFeatureKey, CnnTongueFeaturePrediction> {
  const variant = seed % 4;

  if (variant === 0) {
    return {
      coatingColor: withAlternatives("yellowGreasy", 0.78, "yellow", 0.15),
      coatingTexture: withAlternatives("greasy", 0.82, "thick", 0.12),
      bodyColor: withAlternatives("red", 0.7, "lightRed", 0.2),
      shape: withAlternatives("swollen", 0.67, "teethMarks", 0.21),
      tip: withAlternatives("red", 0.62, "normal", 0.28),
      center: withAlternatives("greasy", 0.76, "red", 0.14),
      sides: withAlternatives("red", 0.58, "normal", 0.31),
    };
  }

  if (variant === 1) {
    return {
      coatingColor: withAlternatives("thinWhite", 0.74, "whiteThick", 0.18),
      coatingTexture: withAlternatives("thin", 0.79, "thick", 0.13),
      bodyColor: withAlternatives("pale", 0.68, "lightRed", 0.23),
      shape: withAlternatives("teethMarks", 0.72, "swollen", 0.18),
      tip: withAlternatives("normal", 0.81, "red", 0.1),
      center: withAlternatives("pale", 0.65, "normal", 0.25),
      sides: withAlternatives("normal", 0.78, "red", 0.13),
    };
  }

  if (variant === 2) {
    return {
      coatingColor: withAlternatives("peeled", 0.66, "thinWhite", 0.22),
      coatingTexture: withAlternatives("dry", 0.7, "none", 0.18),
      bodyColor: withAlternatives("red", 0.73, "lightRed", 0.17),
      shape: withAlternatives("cracked", 0.69, "thin", 0.2),
      tip: withAlternatives("red", 0.64, "spots", 0.17),
      center: withAlternatives("cracked", 0.71, "red", 0.16),
      sides: withAlternatives("normal", 0.63, "red", 0.25),
    };
  }

  return {
    coatingColor: withAlternatives("thinWhite", 0.84, "whiteThick", 0.08),
    coatingTexture: withAlternatives("thin", 0.86, "dry", 0.06),
    bodyColor: withAlternatives("lightRed", 0.82, "red", 0.09),
    shape: withAlternatives("normal", 0.8, "teethMarks", 0.1),
    tip: withAlternatives("normal", 0.83, "red", 0.09),
    center: withAlternatives("normal", 0.78, "pale", 0.11),
    sides: withAlternatives("normal", 0.81, "red", 0.09),
  };
}

function withAlternatives(
  value: string,
  confidence: number,
  alternativeValue: string,
  alternativeConfidence: number,
): CnnTongueFeaturePrediction {
  return {
    value,
    confidence,
    alternatives: [{ value: alternativeValue, confidence: alternativeConfidence }],
  };
}
