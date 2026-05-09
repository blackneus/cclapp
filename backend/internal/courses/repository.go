package courses

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/neusco/ccl-licreamo/backend/internal/db"
)

type Repository struct {
	db *db.DB
}

func NewRepository(database *db.DB) *Repository {
	return &Repository{db: database}
}

func (r *Repository) List(ctx context.Context, tenantID, teacherID string) ([]Course, error) {
	var list []Course
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		query := `SELECT id, tenant_id, teacher_id, title, description,
		           COALESCE(cover_image_url, ''), price::text, status, created_at, updated_at
		           FROM courses`
		args := []interface{}{}
		if teacherID != "" {
			query += " WHERE teacher_id = $1"
			args = append(args, teacherID)
		}
		query += " ORDER BY created_at DESC"

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("courses: list: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var c Course
			if err := rows.Scan(&c.ID, &c.TenantID, &c.TeacherID, &c.Title,
				&c.Description, &c.CoverImageURL, &c.Price, &c.Status,
				&c.CreatedAt, &c.UpdatedAt); err != nil {
				return fmt.Errorf("courses: scan: %w", err)
			}
			list = append(list, c)
		}
		return rows.Err()
	})
	return list, err
}

func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Course, error) {
	var c Course
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT id, tenant_id, teacher_id, title, description,
			 COALESCE(cover_image_url, ''), price::text, status, created_at, updated_at
			 FROM courses WHERE id = $1`,
			id,
		).Scan(&c.ID, &c.TenantID, &c.TeacherID, &c.Title,
			&c.Description, &c.CoverImageURL, &c.Price, &c.Status,
			&c.CreatedAt, &c.UpdatedAt)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &c, err
}

func (r *Repository) Create(ctx context.Context, tenantID string, input CreateCourseInput) (*Course, error) {
	var c Course
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO courses (id, tenant_id, teacher_id, title, description, price, status)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::numeric, 'draft')
			 RETURNING id, tenant_id, teacher_id, title, description,
			 COALESCE(cover_image_url,''), price::text, status, created_at, updated_at`,
			tenantID, input.TeacherID, input.Title, input.Description, input.Price,
		).Scan(&c.ID, &c.TenantID, &c.TeacherID, &c.Title,
			&c.Description, &c.CoverImageURL, &c.Price, &c.Status,
			&c.CreatedAt, &c.UpdatedAt)
	})
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Update(ctx context.Context, tenantID, id string, input UpdateCourseInput) (*Course, error) {
	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if input.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *input.Title)
		argIdx++
	}
	if input.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *input.Description)
		argIdx++
	}
	if input.Price != nil {
		setClauses = append(setClauses, fmt.Sprintf("price = $%d::numeric", argIdx))
		args = append(args, *input.Price)
		argIdx++
	}
	if input.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *input.Status)
		argIdx++
	}

	if len(setClauses) == 0 {
		return r.GetByID(ctx, tenantID, id)
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, id)
	query := fmt.Sprintf(
		`UPDATE courses SET %s WHERE id = $%d
		 RETURNING id, tenant_id, teacher_id, title, description,
		 COALESCE(cover_image_url,''), price::text, status, created_at, updated_at`,
		strings.Join(setClauses, ", "), argIdx,
	)

	var c Course
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, query, args...).Scan(
			&c.ID, &c.TenantID, &c.TeacherID, &c.Title,
			&c.Description, &c.CoverImageURL, &c.Price, &c.Status,
			&c.CreatedAt, &c.UpdatedAt)
	})
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM courses WHERE id = $1`, id)
		return err
	})
}
