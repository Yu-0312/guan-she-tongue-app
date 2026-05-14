-- ════════════════════════════════════════════════════════════════════════════
--  觀舌 Guān Shé · Supabase Database Schema
--  在 Supabase Dashboard → SQL Editor 中貼上並執行
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
--  1. users（與 Supabase Auth 的 auth.users 同步）
--     使用 trigger 在用戶首次登入（Google OAuth）時自動建立此筆記錄
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT        UNIQUE,
  display_name     TEXT,
  avatar_url       TEXT,
  constitution_type TEXT,                         -- 體質測驗結果
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 自動建立 users 記錄的 trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 綁定 trigger 到 auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ────────────────────────────────────────────────────────────────────────────
--  2. daily_check_ins（每日登入打卡記錄）
--     每個用戶每天最多一筆，儲存連續打卡天數（streak）
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_check_ins (
  id             UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  check_in_date  DATE   NOT NULL DEFAULT CURRENT_DATE,
  streak_days    INT2   NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT daily_check_ins_user_date_unique UNIQUE (user_id, check_in_date)
);

CREATE INDEX IF NOT EXISTS daily_check_ins_user_idx ON public.daily_check_ins (user_id, check_in_date DESC);


-- ────────────────────────────────────────────────────────────────────────────
--  3. health_records（每日健康記錄主表）
--     每個用戶每天最多一筆（upsert on conflict）
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_records (
  id               UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  record_date      DATE   NOT NULL DEFAULT CURRENT_DATE,
  tongue_image_url TEXT,                          -- Supabase Storage 路徑
  face_image_url   TEXT,
  overall_score    INT2   CHECK (overall_score BETWEEN 0 AND 100),
  created_at       TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT health_records_user_date_unique UNIQUE (user_id, record_date)
);

CREATE INDEX IF NOT EXISTS health_records_user_idx ON public.health_records (user_id, record_date DESC);


-- ────────────────────────────────────────────────────────────────────────────
--  4. tongue_analyses（CNN 舌象分析結果）
--     與 health_records 一對一
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tongue_analyses (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id         UUID    NOT NULL UNIQUE REFERENCES public.health_records(id) ON DELETE CASCADE,
  tongue_color      TEXT,                         -- 淡紅/紅/紫/暗...
  coating_type      TEXT,                         -- 白/黃/黑/無苔...
  coating_thickness TEXT,                         -- 薄/中/厚
  moisture          TEXT,                         -- 潤/燥/滑
  cnn_confidence    FLOAT4  CHECK (cnn_confidence BETWEEN 0 AND 1),
  raw_logits        JSONB,                        -- CNN 原始輸出向量
  created_at        TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
--  5. constitution_surveys（體質問卷記錄）
--     用戶可多次填寫，最新一筆為當前體質
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.constitution_surveys (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL,                    -- 問卷答案 JSON 陣列
  result_type  TEXT  NOT NULL,                    -- 體質分類結果
  surveyed_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS constitution_surveys_user_idx ON public.constitution_surveys (user_id, surveyed_at DESC);


-- ────────────────────────────────────────────────────────────────────────────
--  6. labeled_dataset（CNN 訓練資料集）
--     匿名化後供模型訓練使用
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.labeled_dataset (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url           TEXT  NOT NULL,
  label_tongue_color  TEXT,
  label_coating       TEXT,
  label_thickness     TEXT,
  label_moisture      TEXT,
  labeled_by          TEXT  DEFAULT 'system',    -- 'system' | 'doctor' | 'user'
  verified            BOOL  DEFAULT FALSE,        -- 經中醫師審核
  created_at          TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
--  Row Level Security（RLS）— 所有表均啟用
-- ════════════════════════════════════════════════════════════════════════════

-- ── users ──
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: 本人可讀取自己的資料"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: 本人可更新自己的資料"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);


-- ── daily_check_ins ──
ALTER TABLE public.daily_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "check_ins: 本人可讀取"
  ON public.daily_check_ins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "check_ins: 本人可新增"
  ON public.daily_check_ins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "check_ins: 本人可更新"
  ON public.daily_check_ins FOR UPDATE
  USING (auth.uid() = user_id);


-- ── health_records ──
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "records: 本人可讀取"
  ON public.health_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "records: 本人可新增"
  ON public.health_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "records: 本人可更新"
  ON public.health_records FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "records: 本人可刪除"
  ON public.health_records FOR DELETE
  USING (auth.uid() = user_id);


-- ── tongue_analyses ──
ALTER TABLE public.tongue_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analyses: 本人可讀取（透過 health_records join）"
  ON public.tongue_analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.health_records hr
      WHERE hr.id = tongue_analyses.record_id
        AND hr.user_id = auth.uid()
    )
  );

CREATE POLICY "analyses: 本人可新增"
  ON public.tongue_analyses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.health_records hr
      WHERE hr.id = record_id
        AND hr.user_id = auth.uid()
    )
  );

CREATE POLICY "analyses: 本人可更新"
  ON public.tongue_analyses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.health_records hr
      WHERE hr.id = tongue_analyses.record_id
        AND hr.user_id = auth.uid()
    )
  );


-- ── constitution_surveys ──
ALTER TABLE public.constitution_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surveys: 本人可讀取"
  ON public.constitution_surveys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "surveys: 本人可新增"
  ON public.constitution_surveys FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ── labeled_dataset（公開讀取已審核資料，僅管理員可寫） ──
ALTER TABLE public.labeled_dataset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dataset: 公開讀取已審核資料"
  ON public.labeled_dataset FOR SELECT
  USING (verified = TRUE);


-- ════════════════════════════════════════════════════════════════════════════
--  Storage Bucket（舌象圖片）
--  在 Supabase Dashboard → Storage → New Bucket 建立，或執行此 SQL
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('health-images', 'health-images', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 用戶只能讀寫自己路徑下（{user_id}/...）的圖片
CREATE POLICY "storage: 本人可上傳"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'health-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: 本人可讀取"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'health-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: 本人可覆寫"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'health-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
