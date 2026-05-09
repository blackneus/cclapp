package courses

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

func (h *Handler) List(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	teacherFilter := ""
	if claims.Role == auth.RoleTeacher {
		teacherFilter = claims.UserID
	}

	list, err := h.repo.List(c.Request().Context(), tenantID, teacherFilter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to list courses"))
	}
	if list == nil {
		list = []Course{}
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "ok", "data": list})
}

func (h *Handler) Get(c echo.Context) error {
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	course, err := h.repo.GetByID(c.Request().Context(), tenantID, c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to get course"))
	}
	if course == nil {
		return echo.NewHTTPError(http.StatusNotFound, errResp("NOT_FOUND", "course not found"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "ok", "data": course})
}

func (h *Handler) Create(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot create courses"))
	}

	var input CreateCourseInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if input.Title == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("VALIDATION", "title is required"))
	}

	if claims.Role == auth.RoleTeacher {
		input.TeacherID = claims.UserID
	}
	if input.TeacherID == "" {
		input.TeacherID = claims.UserID
	}
	if input.Price == "" {
		input.Price = "0"
	}

	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	course, err := h.repo.Create(c.Request().Context(), tenantID, input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to create course"))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"message": "course created", "data": course})
}

func (h *Handler) Update(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	var input UpdateCourseInput
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}

	if claims.Role == auth.RoleTeacher {
		existing, _ := h.repo.GetByID(c.Request().Context(), tenantID, c.Param("id"))
		if existing == nil || existing.TeacherID != claims.UserID {
			return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "not your course"))
		}
	}

	course, err := h.repo.Update(c.Request().Context(), tenantID, c.Param("id"), input)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to update course"))
	}
	if course == nil {
		return echo.NewHTTPError(http.StatusNotFound, errResp("NOT_FOUND", "course not found"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "course updated", "data": course})
}

func (h *Handler) Delete(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "only admins can delete courses"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if err := h.repo.Delete(c.Request().Context(), tenantID, c.Param("id")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to delete course"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "course deleted"})
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}
