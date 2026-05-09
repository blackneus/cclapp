package auth

import "github.com/golang-jwt/jwt/v5"

type UserRole string

const (
	RoleAdmin   UserRole = "admin"
	RoleTeacher UserRole = "teacher"
	RoleStudent UserRole = "student"
)

type Claims struct {
	jwt.RegisteredClaims
	TenantID string   `json:"tid"`
	UserID   string   `json:"uid"`
	Role     UserRole `json:"role"`
	Email    string   `json:"email"`
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

type UserInfo struct {
	ID       string
	TenantID string
	Email    string
	FullName string
	Role     UserRole
	Status   string
}
