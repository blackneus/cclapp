package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"golang.org/x/crypto/bcrypt"

	"github.com/neusco/ccl-licreamo/backend/internal/config"
	"github.com/neusco/ccl-licreamo/backend/internal/db"
	internalhttp "github.com/neusco/ccl-licreamo/backend/internal/http"
	"github.com/neusco/ccl-licreamo/backend/internal/users"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	m, err := migrate.New("file://migrations", cfg.Database.DSN)
	if err != nil {
		slog.Error("migrate init", "error", err)
		os.Exit(1)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		slog.Error("migrate up", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")

	database, err := db.New(ctx, cfg.Database.DSN)
	if err != nil {
		slog.Error("db init", "error", err)
		os.Exit(1)
	}

	if err := runSeed(ctx, database, cfg); err != nil {
		slog.Error("seed failed", "error", err)
		os.Exit(1)
	}

	router := internalhttp.NewRouter(cfg, database)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
		}
	}()

	<-ctx.Done()
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutCtx)
	slog.Info("server stopped")
}

func runSeed(ctx context.Context, database *db.DB, cfg *config.Config) error {
	pool := database.Pool()

	// Ensure tenant licreamo exists
	var tenantID string
	err := pool.QueryRow(ctx,
		`INSERT INTO tenants (slug, subdomain, name, branding)
		 VALUES ('licreamo', 'ccl', 'LICREAMO', '{"primary_color":"#1f3a8a"}')
		 ON CONFLICT (subdomain) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`,
	).Scan(&tenantID)
	if err != nil {
		return fmt.Errorf("seed: upsert tenant: %w", err)
	}
	slog.Info("tenant ready", "tenant_id", tenantID)

	if cfg.Seed.AdminPassword == "" {
		slog.Warn("ADMIN_INITIAL_PASSWORD not set, skipping admin seed")
		return nil
	}

	repo := users.NewRepository(pool)
	existing, err := repo.FindByEmail(ctx, tenantID, cfg.Seed.AdminEmail)
	if err != nil {
		return fmt.Errorf("seed: check admin: %w", err)
	}
	if existing != nil {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.Seed.AdminPassword), 12)
	if err != nil {
		return fmt.Errorf("seed: bcrypt: %w", err)
	}
	if err := repo.CreateAdmin(ctx, tenantID, cfg.Seed.AdminEmail, string(hash), "Irving Solorio"); err != nil {
		return fmt.Errorf("seed: create admin: %w", err)
	}
	slog.Info("admin user created", "email", cfg.Seed.AdminEmail)
	return nil
}
