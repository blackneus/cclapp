package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	pool        *pgxpool.Pool
	jwtSecret   []byte
	accessTTL   time.Duration
	refreshDays int
}

func NewService(pool *pgxpool.Pool, secret string, accessTTL time.Duration, refreshDays int) *Service {
	return &Service{
		pool:        pool,
		jwtSecret:   []byte(secret),
		accessTTL:   accessTTL,
		refreshDays: refreshDays,
	}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Service) Login(ctx context.Context, tenantID string, req LoginRequest) (*TokenPair, *UserInfo, error) {
	var u UserInfo
	var passwordHash *string
	err := s.pool.QueryRow(ctx,
		`SELECT id, tenant_id, email, password_hash, full_name, role, status
		 FROM users
		 WHERE tenant_id = $1 AND email = $2 AND status = 'active'`,
		tenantID, req.Email,
	).Scan(&u.ID, &u.TenantID, &u.Email, &passwordHash, &u.FullName, &u.Role, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, fmt.Errorf("invalid credentials")
	}
	if err != nil {
		return nil, nil, fmt.Errorf("auth: db: %w", err)
	}

	if passwordHash == nil || *passwordHash == "" {
		return nil, nil, fmt.Errorf("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*passwordHash), []byte(req.Password)); err != nil {
		return nil, nil, fmt.Errorf("invalid credentials")
	}

	pair, err := s.generateTokenPair(ctx, u)
	if err != nil {
		return nil, nil, err
	}
	return pair, &u, nil
}

func (s *Service) LoginOrCreateGoogle(ctx context.Context, tenantID, googleSub, email, fullName string) (*TokenPair, *UserInfo, error) {
	var u UserInfo
	err := s.pool.QueryRow(ctx,
		`SELECT id, tenant_id, email, full_name, role, status
		 FROM users
		 WHERE tenant_id = $1 AND (google_sub = $2 OR email = $3) AND status = 'active'
		 LIMIT 1`,
		tenantID, googleSub, email,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status)

	if errors.Is(err, pgx.ErrNoRows) {
		// First-time Google login: create user as admin (only if first user in tenant)
		var count int
		_ = s.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM users WHERE tenant_id = $1`, tenantID,
		).Scan(&count)
		role := "student"
		if count == 0 {
			role = "admin"
		}
		err = s.pool.QueryRow(ctx,
			`INSERT INTO users (tenant_id, email, google_sub, full_name, role)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, tenant_id, email, full_name, role, status`,
			tenantID, email, googleSub, fullName, role,
		).Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status)
		if err != nil {
			return nil, nil, fmt.Errorf("auth: create google user: %w", err)
		}
	} else if err != nil {
		return nil, nil, fmt.Errorf("auth: db: %w", err)
	} else {
		// Link google_sub if not yet linked
		_, _ = s.pool.Exec(ctx,
			`UPDATE users SET google_sub = $1 WHERE id = $2 AND google_sub IS NULL`,
			googleSub, u.ID,
		)
	}

	pair, err := s.generateTokenPair(ctx, u)
	if err != nil {
		return nil, nil, err
	}
	return pair, &u, nil
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	var u UserInfo
	var expiresAt time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.status, rt.expires_at
		 FROM refresh_tokens rt
		 JOIN users u ON u.id = rt.user_id
		 WHERE rt.token = $1 AND rt.revoked_at IS NULL`,
		refreshToken,
	).Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Role, &u.Status, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("invalid refresh token")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: db: %w", err)
	}
	if time.Now().After(expiresAt) {
		return nil, fmt.Errorf("refresh token expired")
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1`, refreshToken,
	)
	if err != nil {
		return nil, fmt.Errorf("auth: revoke: %w", err)
	}
	return s.generateTokenPair(ctx, u)
}

func (s *Service) generateTokenPair(ctx context.Context, u UserInfo) (*TokenPair, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
		},
		TenantID: u.TenantID,
		UserID:   u.ID,
		Role:     u.Role,
		Email:    u.Email,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("auth: sign: %w", err)
	}

	refreshToken := uuid.New().String()
	expiresAt := now.AddDate(0, 0, s.refreshDays)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO refresh_tokens (id, user_id, tenant_id, token, expires_at)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
		u.ID, u.TenantID, refreshToken, expiresAt,
	)
	if err != nil {
		return nil, fmt.Errorf("auth: store refresh: %w", err)
	}
	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(s.accessTTL.Seconds()),
	}, nil
}
