import { useCallback, useEffect, useState } from "react";
import type { DailyCheckIn } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface DailyCheckinState {
  isCheckedIn: boolean;
  streakDays: number;
  todayRecord: DailyCheckIn | null;
  isLoading: boolean;
}

/**
 * 每日登入打卡 Hook
 *
 * - 用戶登入後自動執行今日打卡
 * - 計算連續打卡天數（streak）
 * - 返回打卡狀態供 UI 顯示
 */
export function useDailyCheckin(): DailyCheckinState {
  const { user } = useAuth();
  const [state, setState] = useState<DailyCheckinState>({
    isCheckedIn: false,
    streakDays: 0,
    todayRecord: null,
    isLoading: false,
  });

  const performCheckin = useCallback(async (userId: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    const today = getLocalDateKey();

    try {
      const { supabase } = await import("@/lib/supabase");

      // 1. 查詢今天是否已經打卡
      const { data: existing } = await supabase
        .from("daily_check_ins")
        .select("*")
        .eq("user_id", userId)
        .eq("check_in_date", today)
        .maybeSingle();

      if (existing) {
        // 今天已打卡，直接回傳現有記錄
        setState({
          isCheckedIn: true,
          streakDays: existing.streak_days,
          todayRecord: existing,
          isLoading: false,
        });
        return;
      }

      // 2. 計算連續天數：查詢昨天是否有打卡
      const yesterday = getLocalDateKey(addDays(new Date(), -1));
      const { data: yesterdayRecord } = await supabase
        .from("daily_check_ins")
        .select("streak_days")
        .eq("user_id", userId)
        .eq("check_in_date", yesterday)
        .maybeSingle();

      const newStreak = yesterdayRecord ? yesterdayRecord.streak_days + 1 : 1;

      // 3. 新增今日打卡記錄
      const { data: newRecord, error } = await supabase
        .from("daily_check_ins")
        .insert({
          user_id: userId,
          check_in_date: today,
          streak_days: newStreak,
        })
        .select()
        .single();

      if (error) {
        // 可能是並發重複插入（Race Condition），忽略錯誤
        console.warn("[checkin] 打卡寫入衝突，可能已由其他分頁完成：", error.message);
      }

      setState({
        isCheckedIn: true,
        streakDays: newStreak,
        todayRecord: newRecord ?? null,
        isLoading: false,
      });
    } catch (err) {
      console.error("[checkin] 打卡失敗：", err);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      performCheckin(user.id);
    } else {
      // 未登入時重置狀態
      setState({ isCheckedIn: false, streakDays: 0, todayRecord: null, isLoading: false });
    }
  }, [user?.id, performCheckin]);

  return state;
}

/**
 * 將分析結果儲存至 Supabase
 * - 需登入才能呼叫；未登入時返回 false
 */
export async function saveHealthRecord(
  userId: string,
  payload: {
    tongueImageBase64?: string; // 將圖片上傳至 Storage 後取 URL
    tongueColor?: string;
    coatingType?: string;
    coatingThickness?: string;
    moisture?: string;
    cnnConfidence?: number;
    rawLogits?: Record<string, number>;
    overallScore?: number;
    constitutionType?: string;
  },
): Promise<{ recordId: string } | null> {
  const { supabase } = await import("@/lib/supabase");
  const today = getLocalDateKey();

  // ── 1. 上傳舌象圖片到 Supabase Storage ──────────────────────────────────
  let tongueImageUrl: string | null = null;

  if (payload.tongueImageBase64) {
    try {
      // base64 → Blob
      const res = await fetch(payload.tongueImageBase64);
      const blob = await res.blob();
      const filePath = `${userId}/${today}/tongue.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("health-images")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

      if (!uploadError) {
        const { data } = supabase.storage.from("health-images").getPublicUrl(filePath);
        tongueImageUrl = data.publicUrl;
      }
    } catch (err) {
      console.warn("[saveHealthRecord] 圖片上傳失敗，繼續儲存文字分析：", err);
    }
  }

  // ── 2. 新增 health_records ──────────────────────────────────────────────
  const { data: record, error: recordError } = await supabase
    .from("health_records")
    .upsert(
      {
        user_id: userId,
        record_date: today,
        tongue_image_url: tongueImageUrl,
        overall_score: payload.overallScore ?? null,
      },
      { onConflict: "user_id,record_date" }, // 同一天只保留一筆，重複則更新
    )
    .select("id")
    .single();

  if (recordError || !record) {
    console.error("[saveHealthRecord] health_records 寫入失敗：", recordError?.message);
    return null;
  }

  // ── 3. 新增 tongue_analyses ────────────────────────────────────────────
  await supabase.from("tongue_analyses").upsert(
    {
      record_id: record.id,
      tongue_color: payload.tongueColor ?? null,
      coating_type: payload.coatingType ?? null,
      coating_thickness: payload.coatingThickness ?? null,
      moisture: payload.moisture ?? null,
      cnn_confidence: payload.cnnConfidence ?? null,
      raw_logits: payload.rawLogits ?? null,
    },
    { onConflict: "record_id" },
  );

  // ── 4. 更新用戶體質類型（如果有） ──────────────────────────────────────
  if (payload.constitutionType) {
    await supabase
      .from("users")
      .update({ constitution_type: payload.constitutionType })
      .eq("id", userId);
  }

  return { recordId: record.id };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
