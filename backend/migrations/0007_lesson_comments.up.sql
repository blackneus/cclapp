CREATE TABLE lesson_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lesson_comments_lesson ON lesson_comments(lesson_id, created_at DESC);
ALTER TABLE lesson_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lesson_comments
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
