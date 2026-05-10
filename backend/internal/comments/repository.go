package comments

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/neusco/ccl-licreamo/backend/internal/db"
)

type Comment struct {
	ID         string `json:"id"`
	LessonID   string `json:"lesson_id"`
	UserID     string `json:"user_id"`
	UserName   string `json:"user_name"`
	UserRole   string `json:"user_role"`
	Content    string `json:"content"`
	CreatedAt  string `json:"created_at"`
}

type Repository struct {
	db *db.DB
}

func NewRepository(d *db.DB) *Repository {
	return &Repository{db: d}
}

func (r *Repository) ListByLesson(ctx context.Context, tenantID, lessonID string) ([]Comment, error) {
	var comments []Comment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT c.id, c.lesson_id, c.user_id, u.full_name, u.role::text, c.content, c.created_at::text
			 FROM lesson_comments c
			 JOIN users u ON u.id = c.user_id
			 WHERE c.lesson_id = $1
			 ORDER BY c.created_at DESC`, lessonID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c Comment
			if err := rows.Scan(&c.ID, &c.LessonID, &c.UserID, &c.UserName, &c.UserRole, &c.Content, &c.CreatedAt); err != nil {
				return err
			}
			comments = append(comments, c)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("comments: list: %w", err)
	}
	return comments, nil
}

func (r *Repository) Create(ctx context.Context, tenantID, lessonID, userID, content string) (*Comment, error) {
	var c Comment
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO lesson_comments (tenant_id, lesson_id, user_id, content)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, lesson_id, user_id, content, created_at::text`,
			tenantID, lessonID, userID, content,
		).Scan(&c.ID, &c.LessonID, &c.UserID, &c.Content, &c.CreatedAt)
	})
	if err != nil {
		return nil, fmt.Errorf("comments: create: %w", err)
	}
	// Fetch user name/role for the response
	_ = r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT full_name, role::text FROM users WHERE id = $1`, userID,
		).Scan(&c.UserName, &c.UserRole)
	})
	return &c, nil
}

func (r *Repository) Delete(ctx context.Context, tenantID, id, userID string, isAdmin bool) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var query string
		var args []interface{}
		if isAdmin {
			query = `DELETE FROM lesson_comments WHERE id = $1`
			args = []interface{}{id}
		} else {
			query = `DELETE FROM lesson_comments WHERE id = $1 AND user_id = $2`
			args = []interface{}{id, userID}
		}
		_, err := tx.Exec(ctx, query, args...)
		return err
	})
}
