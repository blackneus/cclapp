package payments

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/neusco/ccl-licreamo/backend/internal/db"
)

const (
	KindEnrollment = "enrollment"
	KindMonthly    = "monthly"
)

type Repository struct {
	db *db.DB
}

func NewRepository(database *db.DB) *Repository {
	return &Repository{db: database}
}

func randomSuffix(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:n]
}

func monthlyRef(year, month int) string {
	return fmt.Sprintf("PAY-%04d%02d-%s", year, month, randomSuffix(6))
}

func enrollmentRef() string {
	return "INS-" + randomSuffix(8)
}

// LineItem represents one row to be created in a CreateGroup call.
type LineItem struct {
	Kind   string  // 'enrollment' or 'monthly'
	Year   int     // ignored when kind=enrollment
	Month  int     // ignored when kind=enrollment
	Amount string  // numeric as text
}

// CreateCashGroup inserts N payment rows directly as 'paid' (no receipt file),
// representing cash payments registered by an admin.
func (r *Repository) CreateCashGroup(
	ctx context.Context,
	tenantID, enrollmentID, adminID string,
	items []LineItem,
) ([]Payment, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("payments: no items provided")
	}
	var out []Payment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var groupID string
		if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&groupID); err != nil {
			return err
		}
		for _, it := range items {
			var (
				ref      string
				yearArg  interface{} = nil
				monthArg interface{} = nil
			)
			switch it.Kind {
			case KindEnrollment:
				ref = "CASH-" + enrollmentRef()[4:]
			case KindMonthly:
				ref = "CASH-" + monthlyRef(it.Year, it.Month)[4:]
				yearArg = it.Year
				monthArg = it.Month
			default:
				return fmt.Errorf("payments: invalid kind %q", it.Kind)
			}
			var row Payment
			err := tx.QueryRow(ctx,
				`INSERT INTO payments
				   (tenant_id, enrollment_id, kind, amount, reference_code, status,
				    receipt_file_url, receipt_group_id, period_year, period_month,
				    deposited_at, verified_at, verified_by)
				 VALUES ($1, $2, $3, $4::numeric, $5, 'paid',
				         '', $6::uuid, $7, $8, NOW(), NOW(), $9::uuid)
				 RETURNING id, tenant_id, enrollment_id, kind, amount::text, reference_code,
				           status, receipt_file_url, receipt_group_id::text,
				           period_year, period_month,
				           deposited_at::text, created_at::text`,
				tenantID, enrollmentID, it.Kind, it.Amount, ref,
				groupID, yearArg, monthArg, adminID,
			).Scan(&row.ID, &row.TenantID, &row.EnrollmentID, &row.Kind, &row.Amount, &row.ReferenceCode,
				&row.Status, &row.ReceiptFileURL, &row.ReceiptGroupID,
				&row.PeriodYear, &row.PeriodMonth,
				&row.DepositedAt, &row.CreatedAt)
			if err != nil {
				return fmt.Errorf("payments: insert cash %s: %w", it.Kind, err)
			}
			out = append(out, row)
		}
		_, err := tx.Exec(ctx,
			`UPDATE enrollments SET payment_status = 'paid' WHERE id = $1`,
			enrollmentID,
		)
		return err
	})
	return out, err
}

// CreateGroup inserts N payment rows sharing the same receipt file and
// receipt_group_id. Mixes 'enrollment' and 'monthly' items freely.
func (r *Repository) CreateGroup(
	ctx context.Context,
	tenantID, enrollmentID, receiptFileURL string,
	items []LineItem,
) ([]Payment, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("payments: no items provided")
	}
	var out []Payment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var groupID string
		if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&groupID); err != nil {
			return err
		}
		for _, it := range items {
			var (
				ref       string
				yearArg   interface{} = nil
				monthArg  interface{} = nil
			)
			switch it.Kind {
			case KindEnrollment:
				ref = enrollmentRef()
			case KindMonthly:
				ref = monthlyRef(it.Year, it.Month)
				yearArg = it.Year
				monthArg = it.Month
			default:
				return fmt.Errorf("payments: invalid kind %q", it.Kind)
			}

			var row Payment
			err := tx.QueryRow(ctx,
				`INSERT INTO payments
				   (tenant_id, enrollment_id, kind, amount, reference_code, status,
				    receipt_file_url, receipt_group_id, period_year, period_month,
				    deposited_at)
				 VALUES ($1, $2, $3, $4::numeric, $5, 'verifying',
				         $6, $7::uuid, $8, $9, NOW())
				 RETURNING id, tenant_id, enrollment_id, kind, amount::text, reference_code,
				           status, receipt_file_url, receipt_group_id::text,
				           period_year, period_month,
				           deposited_at::text, created_at::text`,
				tenantID, enrollmentID, it.Kind, it.Amount, ref,
				receiptFileURL, groupID, yearArg, monthArg,
			).Scan(&row.ID, &row.TenantID, &row.EnrollmentID, &row.Kind, &row.Amount, &row.ReferenceCode,
				&row.Status, &row.ReceiptFileURL, &row.ReceiptGroupID,
				&row.PeriodYear, &row.PeriodMonth,
				&row.DepositedAt, &row.CreatedAt)
			if err != nil {
				return fmt.Errorf("payments: insert %s: %w", it.Kind, err)
			}
			out = append(out, row)
		}
		_, err := tx.Exec(ctx,
			`UPDATE enrollments SET payment_status = 'awaiting_verification'
			 WHERE id = $1 AND payment_status IN ('awaiting_payment', 'rejected')`,
			enrollmentID,
		)
		return err
	})
	return out, err
}

func scanFullPayment(rows pgx.Row, p *Payment) error {
	return rows.Scan(&p.ID, &p.TenantID, &p.EnrollmentID, &p.Kind, &p.Amount, &p.ReferenceCode,
		&p.Status, &p.ReceiptFileURL, &p.ReceiptGroupID,
		&p.PeriodYear, &p.PeriodMonth,
		&p.DepositedAt, &p.VerifiedAt, &p.VerifiedBy,
		&p.RejectionReason, &p.CreatedAt)
}

const fullSelect = `SELECT id, tenant_id, enrollment_id, kind, amount::text, reference_code,
	status, receipt_file_url, receipt_group_id::text,
	period_year, period_month,
	deposited_at::text, verified_at::text, verified_by::text,
	rejection_reason, created_at::text`

func (r *Repository) ListPending(ctx context.Context, tenantID string) ([]Payment, error) {
	var out []Payment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT p.id, p.tenant_id, p.enrollment_id, p.kind, p.amount::text, p.reference_code,
			        p.status, p.receipt_file_url, p.receipt_group_id::text,
			        p.period_year, p.period_month,
			        p.deposited_at::text, p.created_at::text,
			        e.student_id, u.full_name, u.email,
			        e.course_id, c.title
			 FROM payments p
			 JOIN enrollments e ON e.id = p.enrollment_id
			 JOIN users u       ON u.id = e.student_id
			 JOIN courses c     ON c.id = e.course_id
			 WHERE p.tenant_id = $1 AND p.status = 'verifying'
			 ORDER BY p.created_at ASC`,
			tenantID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p Payment
			if err := rows.Scan(&p.ID, &p.TenantID, &p.EnrollmentID, &p.Kind, &p.Amount, &p.ReferenceCode,
				&p.Status, &p.ReceiptFileURL, &p.ReceiptGroupID,
				&p.PeriodYear, &p.PeriodMonth,
				&p.DepositedAt, &p.CreatedAt,
				&p.StudentID, &p.StudentName, &p.StudentEmail,
				&p.CourseID, &p.CourseTitle); err != nil {
				return err
			}
			out = append(out, p)
		}
		return rows.Err()
	})
	return out, err
}

func (r *Repository) ListByEnrollment(ctx context.Context, tenantID, enrollmentID string) ([]Payment, error) {
	var out []Payment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			fullSelect+`
			 FROM payments
			 WHERE tenant_id = $1 AND enrollment_id = $2
			 ORDER BY kind ASC, period_year DESC NULLS LAST, period_month DESC NULLS LAST`,
			tenantID, enrollmentID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p Payment
			if err := scanFullPayment(rows, &p); err != nil {
				return err
			}
			out = append(out, p)
		}
		return rows.Err()
	})
	return out, err
}

func (r *Repository) ListByStudent(ctx context.Context, tenantID, studentID string) ([]Payment, error) {
	var out []Payment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT p.id, p.tenant_id, p.enrollment_id, p.kind, p.amount::text, p.reference_code,
			        p.status, p.receipt_file_url, p.receipt_group_id::text,
			        p.period_year, p.period_month,
			        p.deposited_at::text, p.created_at::text,
			        e.course_id, c.title
			 FROM payments p
			 JOIN enrollments e ON e.id = p.enrollment_id
			 JOIN courses c     ON c.id = e.course_id
			 WHERE p.tenant_id = $1 AND e.student_id = $2
			 ORDER BY p.created_at DESC`,
			tenantID, studentID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p Payment
			if err := rows.Scan(&p.ID, &p.TenantID, &p.EnrollmentID, &p.Kind, &p.Amount, &p.ReferenceCode,
				&p.Status, &p.ReceiptFileURL, &p.ReceiptGroupID,
				&p.PeriodYear, &p.PeriodMonth,
				&p.DepositedAt, &p.CreatedAt,
				&p.CourseID, &p.CourseTitle); err != nil {
				return err
			}
			out = append(out, p)
		}
		return rows.Err()
	})
	return out, err
}

func (r *Repository) VerifyGroup(ctx context.Context, tenantID, groupID, adminID string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE payments
			 SET status = 'paid', verified_at = NOW(), verified_by = $1::uuid
			 WHERE receipt_group_id = $2::uuid AND status = 'verifying'`,
			adminID, groupID,
		)
		if err != nil {
			return fmt.Errorf("payments: verify group: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return errors.New("payments: no pending rows in this group")
		}
		_, err = tx.Exec(ctx,
			`UPDATE enrollments
			 SET payment_status = 'paid'
			 WHERE id IN (
			   SELECT DISTINCT enrollment_id FROM payments
			   WHERE receipt_group_id = $1::uuid
			 )`, groupID,
		)
		return err
	})
}

func (r *Repository) RejectGroup(ctx context.Context, tenantID, groupID, adminID, reason string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE payments
			 SET status = 'rejected', rejection_reason = $1, verified_by = $2::uuid
			 WHERE receipt_group_id = $3::uuid AND status = 'verifying'`,
			reason, adminID, groupID,
		)
		if err != nil {
			return fmt.Errorf("payments: reject group: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return errors.New("payments: no pending rows in this group")
		}
		_, err = tx.Exec(ctx,
			`UPDATE enrollments e
			 SET payment_status = 'rejected'
			 WHERE id IN (
			   SELECT DISTINCT p.enrollment_id FROM payments p
			   WHERE p.receipt_group_id = $1::uuid
			 )
			 AND NOT EXISTS (
			   SELECT 1 FROM payments x
			   WHERE x.enrollment_id = e.id AND x.status = 'paid'
			 )`, groupID,
		)
		return err
	})
}

// HasActiveAccess: returns true iff the enrollment is paid up.
// Rules:
//   - If course.enrollment_fee > 0: there must be a 'paid' enrollment-kind payment.
//   - If course.price > 0: there must be a 'paid' monthly-kind payment for
//     the current month (with `graceDays` falling back to previous month).
//   - If both fees are zero, access is always granted.
func (r *Repository) HasActiveAccess(ctx context.Context, tenantID, enrollmentID string, graceDays int) (bool, error) {
	now := time.Now()
	requiredYear, requiredMonth := now.Year(), int(now.Month())
	if now.Day() <= graceDays {
		prev := now.AddDate(0, -1, 0)
		requiredYear, requiredMonth = prev.Year(), int(prev.Month())
	}
	var ok bool
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var enrollmentFee, monthlyFee float64
		err := tx.QueryRow(ctx,
			`SELECT COALESCE(c.enrollment_fee, 0)::float8, COALESCE(c.price, 0)::float8
			 FROM enrollments e JOIN courses c ON c.id = e.course_id
			 WHERE e.id = $1`, enrollmentID,
		).Scan(&enrollmentFee, &monthlyFee)
		if err != nil {
			return err
		}
		if enrollmentFee > 0 {
			var paid bool
			if err := tx.QueryRow(ctx,
				`SELECT EXISTS (
				   SELECT 1 FROM payments
				   WHERE enrollment_id = $1 AND kind = 'enrollment' AND status = 'paid'
				 )`, enrollmentID,
			).Scan(&paid); err != nil {
				return err
			}
			if !paid {
				ok = false
				return nil
			}
		}
		if monthlyFee > 0 {
			var paid bool
			if err := tx.QueryRow(ctx,
				`SELECT EXISTS (
				   SELECT 1 FROM payments
				   WHERE enrollment_id = $1 AND kind = 'monthly' AND status = 'paid'
				     AND (period_year > $2 OR (period_year = $2 AND period_month >= $3))
				 )`, enrollmentID, requiredYear, requiredMonth,
			).Scan(&paid); err != nil {
				return err
			}
			ok = paid
			return nil
		}
		ok = true
		return nil
	})
	return ok, err
}

// PendingMonths lists months from `since` up to today that have no 'paid' or
// 'verifying' monthly payment yet. Used by the upload UI.
func (r *Repository) PendingMonths(ctx context.Context, tenantID, enrollmentID string, since time.Time) ([]Period, error) {
	now := time.Now()
	all := []Period{}
	cur := time.Date(since.Year(), since.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	for !cur.After(end) {
		all = append(all, Period{Year: cur.Year(), Month: int(cur.Month())})
		cur = cur.AddDate(0, 1, 0)
	}
	if len(all) == 0 {
		return nil, nil
	}
	covered := map[string]bool{}
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT period_year, period_month FROM payments
			 WHERE enrollment_id = $1 AND kind = 'monthly' AND status IN ('paid','verifying')`,
			enrollmentID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var y, m int
			if err := rows.Scan(&y, &m); err != nil {
				return err
			}
			covered[fmt.Sprintf("%d-%d", y, m)] = true
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	out := []Period{}
	for _, p := range all {
		if !covered[fmt.Sprintf("%d-%d", p.Year, p.Month)] {
			out = append(out, p)
		}
	}
	return out, nil
}

// EnrollmentFeeStatus is one of: 'not_required' | 'unpaid' | 'verifying' | 'paid'.
func (r *Repository) EnrollmentFeeStatus(ctx context.Context, tenantID, enrollmentID string) (string, error) {
	var status string
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var fee float64
		if err := tx.QueryRow(ctx,
			`SELECT COALESCE(c.enrollment_fee, 0)::float8
			 FROM enrollments e JOIN courses c ON c.id = e.course_id
			 WHERE e.id = $1`, enrollmentID,
		).Scan(&fee); err != nil {
			return err
		}
		if fee <= 0 {
			status = "not_required"
			return nil
		}
		var rowStatus *string
		err := tx.QueryRow(ctx,
			`SELECT status FROM payments
			 WHERE enrollment_id = $1 AND kind = 'enrollment'
			   AND status IN ('paid','verifying')
			 ORDER BY CASE status WHEN 'paid' THEN 0 ELSE 1 END
			 LIMIT 1`, enrollmentID,
		).Scan(&rowStatus)
		if errors.Is(err, pgx.ErrNoRows) {
			status = "unpaid"
			return nil
		}
		if err != nil {
			return err
		}
		if rowStatus != nil {
			status = *rowStatus
		}
		return nil
	})
	return status, err
}

type EnrollmentInfo struct {
	TenantID      string
	StudentID     string
	CourseID      string
	CourseTitle   string
	MonthlyFee    string // numeric as text
	EnrollmentFee string // numeric as text
	EnrolledAt    time.Time
}

func (r *Repository) GetEnrollmentInfo(ctx context.Context, tenantID, enrollmentID string) (*EnrollmentInfo, error) {
	var info EnrollmentInfo
	info.TenantID = tenantID
	var enrolledAt time.Time
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT e.student_id, e.course_id, c.title, c.price::text, COALESCE(c.enrollment_fee, 0)::text, e.enrolled_at
			 FROM enrollments e
			 JOIN courses c ON c.id = e.course_id
			 WHERE e.id = $1 AND e.tenant_id = $2`,
			enrollmentID, tenantID,
		).Scan(&info.StudentID, &info.CourseID, &info.CourseTitle, &info.MonthlyFee, &info.EnrollmentFee, &enrolledAt)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	info.EnrolledAt = enrolledAt
	return &info, err
}
