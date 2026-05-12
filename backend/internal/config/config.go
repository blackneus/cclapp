package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port     string
	Env      string
	Database DatabaseConfig
	JWT      JWTConfig
	Google   GoogleConfig
	Seed     SeedConfig
	Storage  StorageConfig
	Payments PaymentsConfig
}

type DatabaseConfig struct {
	DSN string
}

type JWTConfig struct {
	Secret      string
	AccessTTL   time.Duration
	RefreshDays int
}

type GoogleConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	FrontendURL  string
	Enabled      bool
}

type SeedConfig struct {
	AdminEmail    string
	AdminPassword string
}

type StorageConfig struct {
	SAKeyPath string
	FolderID  string
	Enabled   bool
}

type PaymentsConfig struct {
	GraceDays int
}

func Load() (*Config, error) {
	host := getEnv("POSTGRES_HOST", "localhost")
	port := getEnv("POSTGRES_PORT", "5432")
	user := mustEnv("POSTGRES_USER")
	pass := mustEnv("POSTGRES_PASSWORD")
	db := mustEnv("POSTGRES_DB")

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, db)

	accessMin, _ := strconv.Atoi(getEnv("JWT_ACCESS_TTL_MINUTES", "15"))
	refreshDays, _ := strconv.Atoi(getEnv("JWT_REFRESH_TTL_DAYS", "30"))

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")

	return &Config{
		Port: getEnv("PORT", "8080"),
		Env:  getEnv("ENV", "development"),
		Database: DatabaseConfig{DSN: dsn},
		JWT: JWTConfig{
			Secret:      mustEnv("JWT_SECRET"),
			AccessTTL:   time.Duration(accessMin) * time.Minute,
			RefreshDays: refreshDays,
		},
		Google: GoogleConfig{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURI:  getEnv("GOOGLE_REDIRECT_URI", "http://localhost/api/auth/google/callback"),
			FrontendURL:  getEnv("FRONTEND_URL", "http://localhost"),
			Enabled:      clientID != "" && clientSecret != "",
		},
		Seed: SeedConfig{
			AdminEmail:    getEnv("ADMIN_EMAIL", "admin@licreamo.com"),
			AdminPassword: os.Getenv("ADMIN_INITIAL_PASSWORD"),
		},
		Storage: StorageConfig{
			SAKeyPath: getEnv("GOOGLE_SA_KEY_PATH", ""),
			FolderID:  getEnv("GOOGLE_DRIVE_FOLDER_ID", ""),
			Enabled:   os.Getenv("GOOGLE_SA_KEY_PATH") != "" && os.Getenv("GOOGLE_DRIVE_FOLDER_ID") != "",
		},
		Payments: PaymentsConfig{
			GraceDays: atoiOr(getEnv("PAYMENT_GRACE_DAYS", "5"), 5),
		},
	}, nil
}

func atoiOr(s string, fallback int) int {
	if v, err := strconv.Atoi(s); err == nil {
		return v
	}
	return fallback
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic("missing required env var: " + key)
	}
	return v
}
