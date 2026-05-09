package modules

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

func (r *Repository) ListByCourse(ctx context.Context, tenantID, courseID string) ([]Module, error) {
	var list []Module
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, course_id, title, description, order_index, created_at, updated_at
			 FROM modules WHERE course_id = $1 ORDER BY order_index, created_at`,
			courseID,
		)
		if err != nil {
			return fmt.Errorf("modules: list: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var m Module
			if err := rows.Scan(&m.ID, &m.TenantID, &m.CourseID, &m.Title,
				&m.Description, &m.OrderIndex, &m.CreatedAt, &m.UpdatedAt); err != nil {
				return fmt.Errorf("modules: scan: %w", err)
			}
			list = append(list, m)
		}
		return rows.Err()
	})
	return list, err
}

func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Module, error) {
	var m Module
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT id, tenant_id, course_id, title, description, order_index, created_at, updated_at
			 FROM modules WHERE id = $1`,
			id,
		).Scan(&m.ID, &m.TenantID, &m.CourseID, &m.Title,
			&m.Description, &m.OrderIndex, &m.CreatedAt, &m.UpdatedAt)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &m, err
}

func (r *Repository) Create(ctx context.Context, tenantID, courseID string, input CreateModuleInput) (*Module, error) {
	var m Module
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO modules (id, tenant_id, course_id, title, description, order_index)
			 SELECT gen_random_uuid(), $1, $2, $3, $4, COALESCE(MAX(order_index)+1, 0)
			 FROM modules WHERE course_id = $2
			 RETURNING id, tenant_id, course_id, title, description, order_index, created_at, updated_at`,
			tenantID, courseID, input.Title, input.Description,
		).Scan(&m.ID, &m.TenantID, &m.CourseID, &m.Title,
			&m.Description, &m.OrderIndex, &m.CreatedAt, &m.UpdatedAt)
	})
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) Update(ctx context.Context, tenantID, id string, input UpdateModuleInput) (*Module, error) {
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
	if len(setClauses) == 0 {
		return r.GetByID(ctx, tenantID, id)
	}
	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, id)

	var m Module
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			fmt.Sprintf(`UPDATE modules SET %s WHERE id = $%d
			 RETURNING id, tenant_id, course_id, title, description, order_index, created_at, updated_at`,
				strings.Join(setClauses, ", "), argIdx),
			args...,
		).Scan(&m.ID, &m.TenantID, &m.CourseID, &m.Title,
			&m.Description, &m.OrderIndex, &m.CreatedAt, &m.UpdatedAt)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &m, err
}

func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM modules WHERE id = $1`, id)
		return err
	})
}

func (r *Repository) Reorder(ctx context.Context, tenantID string, ids []string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		for i, id := range ids {
			if _, err := tx.Exec(ctx,
				`UPDATE modules SET order_index = $1, updated_at = NOW() WHERE id = $2`,
				i, id,
			); err != nil {
				return fmt.Errorf("modules: reorder: %w", err)
			}
		}
		return nil
	})
}
