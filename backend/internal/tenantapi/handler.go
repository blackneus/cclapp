package tenantapi

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}

type Handler struct {
	pool *pgxpool.Pool
}

func NewHandler(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

type tenantPayload struct {
	ID       string  `json:"id"`
	Slug     string  `json:"slug"`
	Subdomain string `json:"subdomain"`
	Name     string  `json:"name"`
	LogoURL  *string `json:"logo_url,omitempty"`
}

// Get returns public tenant info (name + logo) so the frontend can brand the UI.
// Open to any authenticated user (so the alumno también ve el logo).
func (h *Handler) Get(c echo.Context) error {
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	var p tenantPayload
	err := h.pool.QueryRow(c.Request().Context(),
		`SELECT id::text, slug, subdomain, name, logo_url
		 FROM tenants WHERE id = $1`,
		tenantID,
	).Scan(&p.ID, &p.Slug, &p.Subdomain, &p.Name, &p.LogoURL)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": p})
}

type updateInput struct {
	Name    *string `json:"name"`
	LogoURL *string `json:"logo_url"`
}

func (h *Handler) Update(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin"))
	}
	var inp updateInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "body inválido"))
	}
	sets := []string{}
	args := []interface{}{}
	idx := 1
	if inp.Name != nil {
		sets = append(sets, "name = $"+itoa(idx))
		args = append(args, *inp.Name)
		idx++
	}
	if inp.LogoURL != nil {
		sets = append(sets, "logo_url = $"+itoa(idx))
		if *inp.LogoURL == "" {
			args = append(args, nil)
		} else {
			args = append(args, *inp.LogoURL)
		}
		idx++
	}
	if len(sets) == 0 {
		return h.Get(c)
	}
	sets = append(sets, "updated_at = NOW()")
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	args = append(args, tenantID)
	query := "UPDATE tenants SET " + strings.Join(sets, ", ") + " WHERE id = $" + itoa(idx)
	if _, err := h.pool.Exec(c.Request().Context(), query, args...); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return h.Get(c)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	buf := [20]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
