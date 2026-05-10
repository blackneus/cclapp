package users

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

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
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	role := c.QueryParam("role")
	users, err := h.repo.List(c.Request().Context(), tenantID, role)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": users})
}

type CreateInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

func (h *Handler) Create(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin puede crear usuarios"))
	}
	var inp CreateInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	inp.Email = strings.TrimSpace(strings.ToLower(inp.Email))
	inp.FullName = strings.TrimSpace(inp.FullName)
	inp.Role = strings.ToLower(strings.TrimSpace(inp.Role))
	if inp.Email == "" || inp.FullName == "" || inp.Password == "" {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "email, full_name y password son requeridos"))
	}
	if inp.Role != "teacher" && inp.Role != "student" && inp.Role != "admin" {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "role debe ser teacher, student o admin"))
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(inp.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("HASH_ERROR", err.Error()))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	user, err := h.repo.Create(c.Request().Context(), tenantID, inp.Email, string(hash), inp.FullName, inp.Role)
	if err != nil {
		c.Logger().Errorf("users create: %v", err)
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", "no se pudo crear el usuario (¿email duplicado?)"))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"data": user})
}

type UpdateInput struct {
	FullName string `json:"full_name"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

func (h *Handler) Update(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin puede editar"))
	}
	var inp UpdateInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}
	if inp.Status == "" {
		inp.Status = "active"
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	user, err := h.repo.Update(c.Request().Context(), tenantID, c.Param("id"), inp.FullName, inp.Role, inp.Status)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": user})
}

func (h *Handler) Delete(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin puede eliminar"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if err := h.repo.Delete(c.Request().Context(), tenantID, c.Param("id")); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.NoContent(http.StatusNoContent)
}
