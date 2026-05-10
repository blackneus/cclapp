package users

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID        string `json:"id"`
	TenantID  string `json:"tenant_id"`
	Email     string `json:"email"`
	FullName  string `json:"full_name"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
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

func (r *Repository) List(ctx context.Context, tenantID string, role string) ([]User, error) {
	q := `SELECT id, tenant_id, email, full_name, role, status, created_at::text
	      FROM users WHERE tenant_id = $1`
	args := []interface{}{tenantID}
	if role != "" {
		q += ` AND role = $2`
		args = append(args, role)
	}
	q += ` ORDER BY full_name ASC`
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("users: list: %w", err)
	}
	defer rows.Close()
	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (r *Repository) Create(ctx context.Context, tenantID, email, passwordHash, fullName, role string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
		 VALUES ($1, $2, $3, $4, $5, 'active')
		 RETURNING id, tenant_id, email, full_name, role, status, created_at::text`,
		tenantID, email, passwordHash, fullName, role,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("users: create: %w", err)
	}
	return &u, nil
}

func (r *Repository) Update(ctx context.Context, tenantID, id, fullName, role, status string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`UPDATE users SET full_name = $3, role = $4, status = $5, updated_at = NOW()
		 WHERE id = $1 AND tenant_id = $2
		 RETURNING id, tenant_id, email, full_name, role, status, created_at::text`,
		id, tenantID, fullName, role, status,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("users: update: %w", err)
	}
	return &u, nil
}

func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
		id, tenantID,
	)
	return err
}
