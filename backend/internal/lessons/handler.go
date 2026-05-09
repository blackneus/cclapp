package lessons

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
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot create lessons"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	moduleID := c.Param("mid")

	var input CreateLessonInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if input.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("VALIDATION", "title is required"))
	}

	l, err := h.repo.Create(c.Request().Context(), tenantID, moduleID, input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to create lesson"))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"message": "lesson created", "data": l})
}

func (h *Handler) Update(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot update lessons"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	var input UpdateLessonInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}

	l, err := h.repo.Update(c.Request().Context(), tenantID, c.Param("id"), input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to update lesson"))
	}
	if l == nil {
		return echo.NewHTTPError(http.StatusNotFound, errResp("NOT_FOUND", "lesson not found"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "lesson updated", "data": l})
}

func (h *Handler) Delete(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot delete lessons"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if err := h.repo.Delete(c.Request().Context(), tenantID, c.Param("id")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to delete lesson"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "lesson deleted"})
}

func (h *Handler) Reorder(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot reorder lessons"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	var input ReorderInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if err := h.repo.Reorder(c.Request().Context(), tenantID, input.Order); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to reorder lessons"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "lessons reordered"})
}

func (h *Handler) AddAttachment(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot add attachments"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	var input AddAttachmentInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if input.Name == "" || input.DriveFileID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("VALIDATION", "name and drive_file_id are required"))
	}

	a, err := h.repo.AddAttachment(c.Request().Context(), tenantID, c.Param("id"), input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to add attachment"))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"message": "attachment added", "data": a})
}

func (h *Handler) DeleteAttachment(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot delete attachments"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if err := h.repo.DeleteAttachment(c.Request().Context(), tenantID, c.Param("aid")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to delete attachment"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "attachment deleted"})
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}
