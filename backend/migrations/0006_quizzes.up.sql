CREATE TABLE quizzes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    pass_score  INT NOT NULL DEFAULT 70,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lesson_id)
);
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quizzes
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE TABLE quiz_questions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quiz_id     UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_quiz_questions_quiz ON quiz_questions(quiz_id);
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quiz_questions
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE TABLE quiz_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    is_correct  BOOL NOT NULL DEFAULT FALSE,
    order_index INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_quiz_options_question ON quiz_options(question_id);
ALTER TABLE quiz_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quiz_options
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE TABLE quiz_attempts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    score         INT NOT NULL,
    passed        BOOL NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_quiz_attempts_enrollment ON quiz_attempts(enrollment_id, quiz_id);
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quiz_attempts
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
