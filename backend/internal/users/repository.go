package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID       string
	TenantID string
	Email    string
	FullName string
	Role     string
	Status   string
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) FindByEmail(ctx context.Context, tenantID, email string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT id, tenant_id, email, full_name, role, status FROM users
		 WHERE tenant_id = $1 AND email = $2`,
		tenantID, email,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("users: find by email: %w", err)
	}
	return &u, nil
}

func (r *Repository) CountInTenant(ctx context.Context, tenantID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE tenant_id = $1`, tenantID,
	).Scan(&count)
	return count, err
}

func (r *Repository) CreateAdmin(ctx context.Context, tenantID, email, passwordHash, fullName string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
		 VALUES ($1, $2, $3, $4, 'admin', 'active')
		 ON CONFLICT (tenant_id, email) DO NOTHING`,
		tenantID, email, passwordHash, fullName,
	)
	return err
}
