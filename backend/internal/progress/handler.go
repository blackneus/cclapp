package progress

import (
	"net/http"

	"github.com/jackc/pgx/v5"
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

func (h *Handler) Complete(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "only students can mark lessons as complete"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	lessonID := c.Param("id")

	enrollmentID, err := h.repo.EnrollmentForStudent(c.Request().Context(), tenantID, claims.UserID, lessonID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return echo.NewHTTPError(http.StatusForbidden, errResp("NOT_ENROLLED", "you are not enrolled in this course"))
		}
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to verify enrollment"))
	}

	if err := h.repo.Complete(c.Request().Context(), tenantID, enrollmentID, lessonID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to mark lesson complete"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "lesson marked as complete"})
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}
