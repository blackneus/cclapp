package progress

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/neusco/ccl-licreamo/backend/internal/db"
)

type Repository struct {
	db *db.DB
}

func NewRepository(database *db.DB) *Repository {
	return &Repository{db: database}
}

// EnrollmentForStudent returns the enrollment ID for a student in a course (paid or not).
func (r *Repository) EnrollmentForStudent(ctx context.Context, tenantID, studentID, lessonID string) (string, error) {
	var enrollmentID string
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT e.id FROM enrollments e
			 JOIN modules m ON m.course_id = e.course_id
			 JOIN lessons l ON l.module_id = m.id
			 WHERE e.student_id = $1 AND l.id = $2
			 LIMIT 1`,
			studentID, lessonID,
		).Scan(&enrollmentID)
	})
	return enrollmentID, err
}

func (r *Repository) Complete(ctx context.Context, tenantID, enrollmentID, lessonID string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO lesson_progress (tenant_id, enrollment_id, lesson_id)
			 VALUES ($1, $2, $3) ON CONFLICT (enrollment_id, lesson_id) DO NOTHING`,
			tenantID, enrollmentID, lessonID,
		)
		return err
	})
}

func (r *Repository) ListByEnrollment(ctx context.Context, tenantID, enrollmentID string) ([]string, error) {
	var ids []string
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT lesson_id FROM lesson_progress WHERE enrollment_id = $1`,
			enrollmentID,
		)
		if err != nil {
			return fmt.Errorf("progress: list: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return err
			}
			ids = append(ids, id)
		}
		return rows.Err()
	})
	return ids, err
}
