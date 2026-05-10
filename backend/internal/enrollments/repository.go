package enrollments

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Enrollment struct {
	ID            string `json:"id"`
	TenantID      string `json:"tenant_id"`
	StudentID     string `json:"student_id"`
	CourseID      string `json:"course_id"`
	PaymentStatus string `json:"payment_status"`
	EnrolledAt    string `json:"enrolled_at"`
	StudentName   string `json:"student_name,omitempty"`
	StudentEmail  string `json:"student_email,omitempty"`
	CourseTitle   string `json:"course_title,omitempty"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) ListByCourse(ctx context.Context, tenantID, courseID string) ([]Enrollment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT e.id, e.tenant_id, e.student_id, e.course_id, e.payment_status, e.enrolled_at::text,
		        u.full_name, u.email
		 FROM enrollments e
		 JOIN users u ON u.id = e.student_id
		 WHERE e.tenant_id = $1 AND e.course_id = $2
		 ORDER BY e.enrolled_at DESC`, tenantID, courseID)
	if err != nil {
		return nil, fmt.Errorf("enrollments: list: %w", err)
	}
	defer rows.Close()
	var out []Enrollment
	for rows.Next() {
		var e Enrollment
		if err := rows.Scan(&e.ID, &e.TenantID, &e.StudentID, &e.CourseID, &e.PaymentStatus, &e.EnrolledAt, &e.StudentName, &e.StudentEmail); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (r *Repository) ListByStudent(ctx context.Context, tenantID, studentID string) ([]Enrollment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT e.id, e.tenant_id, e.student_id, e.course_id, e.payment_status, e.enrolled_at::text, c.title
		 FROM enrollments e
		 JOIN courses c ON c.id = e.course_id
		 WHERE e.tenant_id = $1 AND e.student_id = $2
		 ORDER BY e.enrolled_at DESC`, tenantID, studentID)
	if err != nil {
		return nil, fmt.Errorf("enrollments: list student: %w", err)
	}
	defer rows.Close()
	var out []Enrollment
	for rows.Next() {
		var e Enrollment
		if err := rows.Scan(&e.ID, &e.TenantID, &e.StudentID, &e.CourseID, &e.PaymentStatus, &e.EnrolledAt, &e.CourseTitle); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (r *Repository) Create(ctx context.Context, tenantID, courseID, studentID, paymentStatus string) (*Enrollment, error) {
	if paymentStatus == "" {
		paymentStatus = "paid"
	}
	var e Enrollment
	err := r.pool.QueryRow(ctx,
		`INSERT INTO enrollments (tenant_id, course_id, student_id, payment_status)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (student_id, course_id) DO UPDATE SET payment_status = EXCLUDED.payment_status
		 RETURNING id, tenant_id, student_id, course_id, payment_status, enrolled_at::text`,
		tenantID, courseID, studentID, paymentStatus,
	).Scan(&e.ID, &e.TenantID, &e.StudentID, &e.CourseID, &e.PaymentStatus, &e.EnrolledAt)
	if err != nil {
		return nil, fmt.Errorf("enrollments: create: %w", err)
	}
	return &e, nil
}

func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM enrollments WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	return err
}
