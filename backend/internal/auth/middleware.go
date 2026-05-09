package auth

import (
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

const ctxKeyClaims = "claims"

// JWTMiddleware validates Bearer tokens and injects Claims into the Echo context.
func JWTMiddleware(secret string) echo.MiddlewareFunc {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"HS256"}))
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return echo.NewHTTPError(http.StatusUnauthorized, errResp("TOKEN_MISSING", "authorization required"))
			}
			tokenStr := strings.TrimPrefix(header, "Bearer ")
			claims := &Claims{}
			_, err := parser.ParseWithClaims(tokenStr, claims, func(_ *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			})
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, errResp("TOKEN_INVALID", "invalid or expired token"))
			}
			c.Set(ctxKeyClaims, claims)
			return next(c)
		}
	}
}

// GetClaims extracts typed Claims from the Echo context (panics if JWT middleware did not run).
func GetClaims(c echo.Context) *Claims {
	return c.Get(ctxKeyClaims).(*Claims)
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}
