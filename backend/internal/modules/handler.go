package modules

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) Create(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot create modules"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	courseID := c.Param("cid")

	var input CreateModuleInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if input.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("VALIDATION", "title is required"))
	}

	m, err := h.repo.Create(c.Request().Context(), tenantID, courseID, input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to create module"))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"message": "module created", "data": m})
}

func (h *Handler) Update(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot update modules"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	var input UpdateModuleInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}

	m, err := h.repo.Update(c.Request().Context(), tenantID, c.Param("id"), input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to update module"))
	}
	if m == nil {
		return echo.NewHTTPError(http.StatusNotFound, errResp("NOT_FOUND", "module not found"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "module updated", "data": m})
}

func (h *Handler) Delete(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot delete modules"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if err := h.repo.Delete(c.Request().Context(), tenantID, c.Param("id")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to delete module"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "module deleted"})
}

func (h *Handler) Reorder(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot reorder modules"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	var input ReorderInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if err := h.repo.Reorder(c.Request().Context(), tenantID, input.Order); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to reorder modules"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "modules reordered"})
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}
