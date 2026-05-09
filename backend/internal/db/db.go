package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, dsn string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("db: parse config: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("db: ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

func (d *DB) Pool() *pgxpool.Pool { return d.pool }

// WithTenant opens a transaction, drops to the limited 'licreamo_app' role
// (subject to RLS), sets app.tenant_id LOCAL, executes fn, then commits.
// Both SET LOCAL ROLE and set_config with is_local=true reset on COMMIT/ROLLBACK,
// preventing tenant/privilege leakage through the connection pool.
func (d *DB) WithTenant(ctx context.Context, tenantID string, fn func(pgx.Tx) error) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Drop to non-superuser role so RLS policies are enforced.
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE licreamo_app"); err != nil {
		return fmt.Errorf("db: set role: %w", err)
	}

	if _, err := tx.Exec(ctx,
		"SELECT set_config('app.tenant_id', $1, true)", tenantID,
	); err != nil {
		return fmt.Errorf("db: set tenant: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
