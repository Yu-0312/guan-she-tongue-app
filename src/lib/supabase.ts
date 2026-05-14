import { createClient } from "@supabase/supabase-js";

// ─── 環境變數 ────────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 尚未設定，" +
      "請複製 .env.example 為 .env.local 並填入你的 Supabase 專案資訊。",
  );
}

// ─── Supabase Client ─────────────────────────────────────────────────────────
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    // 使用 localStorage 保存 session，讓用戶重新整理後不需重新登入
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // 處理 Google OAuth redirect 的 hash/code
  },
});

// ─── Database 型別定義 ───────────────────────────────────────────────────────
export interface DailyCheckIn {
  id: string;
  user_id: string;
  check_in_date: string; // ISO date string "YYYY-MM-DD"
  streak_days: number;
  created_at: string;
}

export interface HealthRecord {
  id: string;
  user_id: string;
  record_date: string;
  tongue_image_url: string | null;
  face_image_url: string | null;
  overall_score: number | null;
  created_at: string;
}

export interface TongueAnalysis {
  id: string;
  record_id: string;
  tongue_color: string | null;
  coating_type: string | null;
  coating_thickness: string | null;
  moisture: string | null;
  cnn_confidence: number | null;
  raw_logits: Record<string, number> | null;
  created_at: string;
}

export interface ConstitutionSurvey {
  id: string;
  user_id: string;
  answers: unknown;
  result_type: string;
  surveyed_at: string;
}

export type { User, Session } from "@supabase/supabase-js";
