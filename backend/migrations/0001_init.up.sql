-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'student');
CREATE TYPE user_status AS ENUM ('active', 'suspended');
CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE quiz_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'matching');
CREATE TYPE enrollment_payment_status AS ENUM (
    'awaiting_payment', 'awaiting_verification', 'paid', 'rejected', 'refunded'
);
CREATE TYPE payment_status AS ENUM ('awaiting', 'verifying', 'paid', 'rejected');
CREATE TYPE payroll_status AS ENUM ('open', 'closed');
CREATE TYPE payroll_item_status AS ENUM ('pending', 'paid');
CREATE TYPE session_status AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE session_modality AS ENUM ('presential', 'online', 'both');
CREATE TYPE notification_channel AS ENUM ('telegram', 'email', 'sms');
CREATE TYPE notification_status AS ENUM ('sent', 'failed');
CREATE TYPE video_provider AS ENUM ('drive', 'nas', 's3');
CREATE TYPE payout_rule_type AS ENUM ('flat_per_student', 'percentage');

-- ============================================================
-- TENANTS (no RLS — used by tenancy middleware before auth)
-- ============================================================

CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    subdomain   TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    branding    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email            TEXT NOT NULL,
    password_hash    TEXT,                    -- nullable: OAuth users may not have password
    google_sub       TEXT,                    -- Google OAuth subject identifier
    full_name        TEXT NOT NULL,
    role             user_role NOT NULL,
    telegram_chat_id TEXT,
    status           user_status NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email),
    UNIQUE NULLS NOT DISTINCT (tenant_id, google_sub)
);

CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- COURSES
-- ============================================================

CREATE TABLE courses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    teacher_id        UUID NOT NULL REFERENCES users(id),
    title             TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    cover_image_url   TEXT,
    price             NUMERIC(10,2) NOT NULL DEFAULT 0,
    payout_rule_type  payout_rule_type,
    payout_rule_value NUMERIC(10,4),
    status            course_status NOT NULL DEFAULT 'draft',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_tenant ON courses(tenant_id);
CREATE INDEX idx_courses_teacher ON courses(teacher_id);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON courses
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- MODULES
-- ============================================================

CREATE TABLE modules (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_id              UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title                  TEXT NOT NULL,
    description            TEXT NOT NULL DEFAULT '',
    order_index            INT NOT NULL DEFAULT 0,
    prerequisite_module_id UUID REFERENCES modules(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_modules_course ON modules(course_id);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON modules
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- LESSONS
-- ============================================================

CREATE TABLE lessons (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_id              UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title                  TEXT NOT NULL,
    description            TEXT NOT NULL DEFAULT '',
    order_index            INT NOT NULL DEFAULT 0,
    video_storage_provider video_provider,
    video_storage_ref      TEXT,
    duration_seconds       INT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lessons_module ON lessons(module_id);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lessons
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- QUIZZES
-- ============================================================

CREATE TABLE quizzes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_id    UUID NOT NULL UNIQUE REFERENCES modules(id) ON DELETE CASCADE,
    passing_score INT NOT NULL DEFAULT 70 CHECK (passing_score BETWEEN 0 AND 100),
    max_attempts  INT NOT NULL DEFAULT 1,
    status        quiz_status NOT NULL DEFAULT 'draft',
    published_at  TIMESTAMPTZ,
    published_by  UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quizzes
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- QUESTIONS
-- ============================================================

CREATE TABLE questions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quiz_id     UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    type        question_type NOT NULL,
    text        TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    order_index INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_quiz ON questions(quiz_id);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON questions
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- QUESTION OPTIONS (for multiple_choice and true_false)
-- ============================================================

CREATE TABLE question_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    is_correct  BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_question_options_question ON question_options(question_id);

-- No RLS needed: accessed via questions which already has RLS

-- ============================================================
-- MATCHING PAIRS (for matching questions)
-- ============================================================

CREATE TABLE matching_pairs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    left_text   TEXT NOT NULL,
    right_text  TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_matching_pairs_question ON matching_pairs(question_id);

-- ============================================================
-- ENROLLMENTS
-- ============================================================

CREATE TABLE enrollments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES users(id),
    course_id         UUID NOT NULL REFERENCES courses(id),
    payment_status    enrollment_payment_status NOT NULL DEFAULT 'awaiting_payment',
    current_module_id UUID REFERENCES modules(id),
    enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    UNIQUE (student_id, course_id)
);

CREATE INDEX idx_enrollments_tenant ON enrollments(tenant_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON enrollments
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- ATTEMPTS
-- ============================================================

CREATE TABLE attempts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    quiz_id       UUID NOT NULL REFERENCES quizzes(id),
    score         INT NOT NULL CHECK (score BETWEEN 0 AND 100),
    passed        BOOLEAN NOT NULL,
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attempts_enrollment ON attempts(enrollment_id);
CREATE INDEX idx_attempts_quiz ON attempts(quiz_id);

ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attempts
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- ANSWERS
-- ============================================================

CREATE TABLE answers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id   UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id  UUID NOT NULL REFERENCES questions(id),
    given_answer JSONB NOT NULL,
    is_correct   BOOLEAN NOT NULL
);

CREATE INDEX idx_answers_attempt ON answers(attempt_id);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    enrollment_id    UUID NOT NULL REFERENCES enrollments(id),
    amount           NUMERIC(10,2) NOT NULL,
    reference_code   TEXT NOT NULL UNIQUE,
    status           payment_status NOT NULL DEFAULT 'awaiting',
    receipt_file_url TEXT,
    deposited_at     TIMESTAMPTZ,
    verified_at      TIMESTAMPTZ,
    verified_by      UUID REFERENCES users(id),
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_enrollment ON payments(enrollment_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- PAYROLL PERIODS
-- ============================================================

CREATE TABLE payroll_periods (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year       INT NOT NULL,
    month      INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    status     payroll_status NOT NULL DEFAULT 'open',
    closed_at  TIMESTAMPTZ,
    closed_by  UUID REFERENCES users(id),
    UNIQUE (tenant_id, year, month)
);

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_periods
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- PAYROLL ITEMS
-- ============================================================

CREATE TABLE payroll_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_id           UUID NOT NULL REFERENCES payroll_periods(id),
    teacher_id          UUID NOT NULL REFERENCES users(id),
    course_id           UUID NOT NULL REFERENCES courses(id),
    paid_students_count INT NOT NULL DEFAULT 0,
    amount              NUMERIC(10,2) NOT NULL,
    status              payroll_item_status NOT NULL DEFAULT 'pending',
    receipt_file_url    TEXT,
    paid_at             TIMESTAMPTZ,
    paid_by             UUID REFERENCES users(id)
);

CREATE INDEX idx_payroll_items_period ON payroll_items(period_id);
CREATE INDEX idx_payroll_items_teacher ON payroll_items(teacher_id);

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_items
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- TEACHER AVAILABILITY
-- ============================================================

CREATE TABLE teacher_availability (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    teacher_id  UUID NOT NULL REFERENCES users(id),
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    modality    session_modality NOT NULL DEFAULT 'both'
);

CREATE INDEX idx_teacher_availability_teacher ON teacher_availability(teacher_id);

ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teacher_availability
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- CLASS SESSIONS
-- ============================================================

CREATE TABLE class_sessions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    teacher_id           UUID NOT NULL REFERENCES users(id),
    course_id            UUID REFERENCES courses(id),
    scheduled_at         TIMESTAMPTZ NOT NULL,
    duration_minutes     INT NOT NULL DEFAULT 60,
    modality             session_modality NOT NULL,
    location_or_meet_url TEXT,
    recording_url        TEXT,
    status               session_status NOT NULL DEFAULT 'scheduled',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_class_sessions_teacher ON class_sessions(teacher_id);
CREATE INDEX idx_class_sessions_scheduled ON class_sessions(scheduled_at);

ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON class_sessions
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- NOTIFICATION LOGS
-- ============================================================

CREATE TABLE notification_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id),
    channel       notification_channel NOT NULL,
    message       TEXT NOT NULL,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        notification_status NOT NULL,
    error_message TEXT
);

CREATE INDEX idx_notification_logs_user ON notification_logs(user_id);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_logs
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id),
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
