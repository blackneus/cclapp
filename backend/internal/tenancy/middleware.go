package tenancy

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

const CtxKeyTenantID = "tenant_id"

type Tenant struct {
	ID        string
	Slug      string
	Subdomain string
	Name      string
}

// Middleware resolves the tenant from the request and injects tenant_id into
// the Echo context. Priority: X-Tenant-Subdomain header (dev) > Host subdomain (prod).
func Middleware(pool *pgxpool.Pool) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			subdomain := extractSubdomain(c.Request())
			if subdomain == "" {
				return echo.NewHTTPError(http.StatusBadRequest, errResp("TENANT_MISSING", "tenant subdomain required"))
			}

			tenant, err := resolveTenant(c.Request().Context(), pool, subdomain)
			if err != nil || tenant == nil {
				return echo.NewHTTPError(http.StatusNotFound, errResp("TENANT_NOT_FOUND", "tenant not found"))
			}

			c.Set(CtxKeyTenantID, tenant.ID)
			c.Set("tenant", tenant)
			return next(c)
		}
	}
}

func extractSubdomain(r *http.Request) string {
	if h := r.Header.Get("X-Tenant-Subdomain"); h != "" {
		return strings.ToLower(strings.TrimSpace(h))
	}
	host := r.Host
	if idx := strings.Index(host, ":"); idx != -1 {
		host = host[:idx]
	}
	parts := strings.SplitN(host, ".", 2)
	if len(parts) == 2 && parts[0] != "www" {
		return parts[0]
	}
	return ""
}

func resolveTenant(ctx context.Context, pool *pgxpool.Pool, subdomain string) (*Tenant, error) {
	var t Tenant
	err := pool.QueryRow(ctx,
		`SELECT id, slug, subdomain, name FROM tenants WHERE subdomain = $1`,
		subdomain,
	).Scan(&t.ID, &t.Slug, &t.Subdomain, &t.Name)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func errResp(code, message string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": message}}
}
