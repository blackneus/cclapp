CREATE TABLE lesson_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    drive_file_id TEXT NOT NULL,
    mime_type     TEXT NOT NULL DEFAULT 'application/pdf',
    order_index   INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lesson_attachments_lesson ON lesson_attachments(lesson_id);
ALTER TABLE lesson_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lesson_attachments
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE TABLE lesson_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enrollment_id, lesson_id)
);
CREATE INDEX idx_lesson_progress_enrollment ON lesson_progress(enrollment_id);
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lesson_progress
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
