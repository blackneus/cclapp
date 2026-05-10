package comments

import (
	"net/http"
	"strings"

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

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}

func (h *Handler) List(c echo.Context) error {
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	list, err := h.repo.ListByLesson(c.Request().Context(), tenantID, c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": list})
}

type CreateInput struct {
	Content string `json:"content"`
}

func (h *Handler) Create(c echo.Context) error {
	claims := auth.GetClaims(c)
	var inp CreateInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	inp.Content = strings.TrimSpace(inp.Content)
	if inp.Content == "" {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "el comentario no puede estar vacío"))
	}
	if len(inp.Content) > 5000 {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "el comentario es demasiado largo"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	cmt, err := h.repo.Create(c.Request().Context(), tenantID, c.Param("id"), claims.UserID, inp.Content)
	if err != nil {
		c.Logger().Errorf("comments create: %v", err)
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"data": cmt})
}

func (h *Handler) Delete(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	isAdmin := claims.Role == auth.RoleAdmin
	if err := h.repo.Delete(c.Request().Context(), tenantID, c.Param("cid"), claims.UserID, isAdmin); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.NoContent(http.StatusNoContent)
}
