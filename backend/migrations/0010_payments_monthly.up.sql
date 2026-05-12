-- Pagos: una fila de `payments` puede ser:
--   kind='enrollment' → cuota única de inscripción (period_year/month NULL)
--   kind='monthly'    → mensualidad de un (year, month)
-- Varias filas pueden compartir el mismo comprobante (alumno paga N conceptos
-- con un solo depósito) vía `receipt_group_id`.

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS enrollment_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS kind             TEXT NOT NULL DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS period_year      INT,
    ADD COLUMN IF NOT EXISTS period_month     INT,
    ADD COLUMN IF NOT EXISTS receipt_group_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_kind_check') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_kind_check
            CHECK (kind IN ('enrollment','monthly'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_period_month_check') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_period_month_check
            CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12);
    END IF;
END $$;

-- Una mensualidad por enrollment + (year, month), ignorando rechazadas.
CREATE UNIQUE INDEX IF NOT EXISTS payments_enrollment_period_unique
    ON payments (enrollment_id, period_year, period_month)
    WHERE kind = 'monthly' AND period_year IS NOT NULL AND status <> 'rejected';

-- Una sola inscripción activa por enrollment.
CREATE UNIQUE INDEX IF NOT EXISTS payments_enrollment_fee_unique
    ON payments (enrollment_id)
    WHERE kind = 'enrollment' AND status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_payments_status         ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_status  ON payments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_receipt_group  ON payments(receipt_group_id)
    WHERE receipt_group_id IS NOT NULL;
