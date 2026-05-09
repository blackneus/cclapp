package lessons

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

func scanLesson(row pgx.Row) (*Lesson, error) {
	var l Lesson
	err := row.Scan(
		&l.ID, &l.TenantID, &l.ModuleID, &l.Title, &l.Description,
		&l.OrderIndex, &l.VideoStorageProvider, &l.VideoStorageRef,
		&l.DurationSeconds, &l.CreatedAt, &l.UpdatedAt,
	)
	return &l, err
}

func (r *Repository) ListByModule(ctx context.Context, tenantID, moduleID string) ([]Lesson, error) {
	var list []Lesson
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, tenant_id, module_id, title, description, order_index,
			        COALESCE(video_storage_provider::text, ''), COALESCE(video_storage_ref, ''),
			        COALESCE(duration_seconds, 0), created_at, updated_at
			 FROM lessons WHERE module_id = $1 ORDER BY order_index, created_at`,
			moduleID,
		)
		if err != nil {
			return fmt.Errorf("lessons: list: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var l Lesson
			if err := rows.Scan(
				&l.ID, &l.TenantID, &l.ModuleID, &l.Title, &l.Description,
				&l.OrderIndex, &l.VideoStorageProvider, &l.VideoStorageRef,
				&l.DurationSeconds, &l.CreatedAt, &l.UpdatedAt,
			); err != nil {
				return fmt.Errorf("lessons: scan: %w", err)
			}
			l.Attachments = []Attachment{}
			list = append(list, l)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		// Cargar attachments para todas las lecciones
		if len(list) == 0 {
			return nil
		}
		ids := make([]string, len(list))
		for i, l := range list {
			ids[i] = l.ID
		}
		aRows, err := tx.Query(ctx,
			`SELECT id, lesson_id, name, drive_file_id, mime_type, order_index, created_at
			 FROM lesson_attachments WHERE lesson_id = ANY($1) ORDER BY order_index`,
			ids,
		)
		if err != nil {
			return fmt.Errorf("lessons: list attachments: %w", err)
		}
		defer aRows.Close()
		attachMap := map[string][]Attachment{}
		for aRows.Next() {
			var a Attachment
			var lessonID string
			if err := aRows.Scan(&a.ID, &lessonID, &a.Name, &a.DriveFileID, &a.MimeType, &a.OrderIndex, &a.CreatedAt); err != nil {
				return err
			}
			attachMap[lessonID] = append(attachMap[lessonID], a)
		}
		for i := range list {
			if atts, ok := attachMap[list[i].ID]; ok {
				list[i].Attachments = atts
			}
		}
		return aRows.Err()
	})
	return list, err
}

func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Lesson, error) {
	var l Lesson
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`SELECT id, tenant_id, module_id, title, description, order_index,
			        COALESCE(video_storage_provider::text, ''), COALESCE(video_storage_ref, ''),
			        COALESCE(duration_seconds, 0), created_at, updated_at
			 FROM lessons WHERE id = $1`,
			id,
		).Scan(
			&l.ID, &l.TenantID, &l.ModuleID, &l.Title, &l.Description,
			&l.OrderIndex, &l.VideoStorageProvider, &l.VideoStorageRef,
			&l.DurationSeconds, &l.CreatedAt, &l.UpdatedAt,
		)
		if err != nil {
			return err
		}
		l.Attachments = []Attachment{}
		aRows, err := tx.Query(ctx,
			`SELECT id, lesson_id, name, drive_file_id, mime_type, order_index, created_at
			 FROM lesson_attachments WHERE lesson_id = $1 ORDER BY order_index`,
			id,
		)
		if err != nil {
			return err
		}
		defer aRows.Close()
		for aRows.Next() {
			var a Attachment
			var lid string
			if err := aRows.Scan(&a.ID, &lid, &a.Name, &a.DriveFileID, &a.MimeType, &a.OrderIndex, &a.CreatedAt); err != nil {
				return err
			}
			l.Attachments = append(l.Attachments, a)
		}
		return aRows.Err()
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &l, err
}

func (r *Repository) Create(ctx context.Context, tenantID, moduleID string, input CreateLessonInput) (*Lesson, error) {
	var l Lesson
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		provider := input.VideoStorageProvider
		if provider == "" {
			provider = "drive"
		}
		err := tx.QueryRow(ctx,
			`INSERT INTO lessons (id, tenant_id, module_id, title, description, order_index,
			                     video_storage_provider, video_storage_ref, duration_seconds)
			 SELECT gen_random_uuid(), $1, $2, $3, $4,
			        COALESCE(MAX(order_index)+1, 0), $5::video_provider, $6, $7
			 FROM lessons WHERE module_id = $2
			 RETURNING id, tenant_id, module_id, title, description, order_index,
			           COALESCE(video_storage_provider::text,''), COALESCE(video_storage_ref,''),
			           COALESCE(duration_seconds,0), created_at, updated_at`,
			tenantID, moduleID, input.Title, input.Description,
			provider, input.VideoStorageRef, input.DurationSeconds,
		).Scan(
			&l.ID, &l.TenantID, &l.ModuleID, &l.Title, &l.Description,
			&l.OrderIndex, &l.VideoStorageProvider, &l.VideoStorageRef,
			&l.DurationSeconds, &l.CreatedAt, &l.UpdatedAt,
		)
		l.Attachments = []Attachment{}
		return err
	})
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *Repository) Update(ctx context.Context, tenantID, id string, input UpdateLessonInput) (*Lesson, error) {
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
	if input.VideoStorageProvider != nil {
		setClauses = append(setClauses, fmt.Sprintf("video_storage_provider = $%d::video_provider", argIdx))
		args = append(args, *input.VideoStorageProvider)
		argIdx++
	}
	if input.VideoStorageRef != nil {
		setClauses = append(setClauses, fmt.Sprintf("video_storage_ref = $%d", argIdx))
		args = append(args, *input.VideoStorageRef)
		argIdx++
	}
	if input.DurationSeconds != nil {
		setClauses = append(setClauses, fmt.Sprintf("duration_seconds = $%d", argIdx))
		args = append(args, *input.DurationSeconds)
		argIdx++
	}
	if len(setClauses) == 0 {
		return r.GetByID(ctx, tenantID, id)
	}
	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, id)

	var l Lesson
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			fmt.Sprintf(`UPDATE lessons SET %s WHERE id = $%d
			 RETURNING id, tenant_id, module_id, title, description, order_index,
			           COALESCE(video_storage_provider::text,''), COALESCE(video_storage_ref,''),
			           COALESCE(duration_seconds,0), created_at, updated_at`,
				strings.Join(setClauses, ", "), argIdx),
			args...,
		).Scan(
			&l.ID, &l.TenantID, &l.ModuleID, &l.Title, &l.Description,
			&l.OrderIndex, &l.VideoStorageProvider, &l.VideoStorageRef,
			&l.DurationSeconds, &l.CreatedAt, &l.UpdatedAt,
		)
		l.Attachments = []Attachment{}
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &l, err
}

func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM lessons WHERE id = $1`, id)
		return err
	})
}

func (r *Repository) Reorder(ctx context.Context, tenantID string, ids []string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		for i, id := range ids {
			if _, err := tx.Exec(ctx,
				`UPDATE lessons SET order_index = $1, updated_at = NOW() WHERE id = $2`,
				i, id,
			); err != nil {
				return fmt.Errorf("lessons: reorder: %w", err)
			}
		}
		return nil
	})
}

func (r *Repository) AddAttachment(ctx context.Context, tenantID, lessonID string, input AddAttachmentInput) (*Attachment, error) {
	var a Attachment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		mimeType := input.MimeType
		if mimeType == "" {
			mimeType = "application/pdf"
		}
		return tx.QueryRow(ctx,
			`INSERT INTO lesson_attachments (tenant_id, lesson_id, name, drive_file_id, mime_type, order_index)
			 SELECT $1, $2, $3, $4, $5, COALESCE(MAX(order_index)+1, 0)
			 FROM lesson_attachments WHERE lesson_id = $2
			 RETURNING id, name, drive_file_id, mime_type, order_index, created_at`,
			tenantID, lessonID, input.Name, input.DriveFileID, mimeType,
		).Scan(&a.ID, &a.Name, &a.DriveFileID, &a.MimeType, &a.OrderIndex, &a.CreatedAt)
	})
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *Repository) DeleteAttachment(ctx context.Context, tenantID, id string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM lesson_attachments WHERE id = $1`, id)
		return err
	})
}
