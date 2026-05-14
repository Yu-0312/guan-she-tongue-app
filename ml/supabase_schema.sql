-- Guan She Tongue AI Supabase schema
-- Run this in Supabase Dashboard > SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    birth_year INTEGER,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    constitution_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS constitution_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    result_type TEXT NOT NULL,
    scores_json JSONB,
    questionnaire_version TEXT DEFAULT 'v1',
    tested_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tongue_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    image_url TEXT,
    image_hash TEXT,
    diagnosis_class TEXT NOT NULL,
    confidence NUMERIC(5, 2),
    all_probabilities JSONB,
    tcm_syndrome TEXT,
    constitution_type TEXT,
    ai_analysis_json JSONB,
    model_version TEXT DEFAULT 'v1.0',
    inference_time_sec NUMERIC(6, 3),
    device_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS health_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    period DATE NOT NULL,
    dominant_class TEXT,
    record_count INTEGER DEFAULT 0,
    summary_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, period)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE constitution_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tongue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_profile ON user_profiles;
CREATE POLICY users_own_profile
    ON user_profiles
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS users_own_constitution ON constitution_results;
CREATE POLICY users_own_constitution
    ON constitution_results
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_tongue_records ON tongue_records;
CREATE POLICY users_own_tongue_records
    ON tongue_records
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_trends ON health_trends;
CREATE POLICY users_own_trends
    ON health_trends
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_constitution_results_user_tested
    ON constitution_results (user_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_tongue_records_user_created
    ON tongue_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tongue_records_class
    ON tongue_records (diagnosis_class);
CREATE INDEX IF NOT EXISTS idx_health_trends_user_period
    ON health_trends (user_id, period DESC);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('tongue-images', 'tongue-images', true)
ON CONFLICT (id) DO NOTHING;
