package enrollments

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

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}

func (h *Handler) ListByCourse(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	list, err := h.repo.ListByCourse(c.Request().Context(), tenantID, c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": list})
}

// ListMine returns enrollments belonging to the calling student (or teacher
// can also query their own — we keep it general).
func (h *Handler) ListMine(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	list, err := h.repo.ListByStudent(c.Request().Context(), tenantID, claims.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	if list == nil {
		list = []Enrollment{}
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": list})
}

type CreateInput struct {
	StudentID     string `json:"student_id"`
	PaymentStatus string `json:"payment_status"`
}

func (h *Handler) Create(c echo.Context) error {
	claims := auth.GetClaims(c)
	var inp CreateInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}

	// Auto-inscripción para alumnos: ignora student_id del body, fuerza self.
	if claims.Role == auth.RoleStudent {
		inp.StudentID = claims.UserID
		inp.PaymentStatus = "awaiting_payment"
	} else {
		if inp.StudentID == "" {
			return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "student_id es requerido"))
		}
		// Admin/teacher pueden forzar paid con flag, si no, awaiting_payment.
		if c.QueryParam("paid_now") == "true" {
			inp.PaymentStatus = "paid"
		} else if inp.PaymentStatus == "" {
			inp.PaymentStatus = "awaiting_payment"
		}
	}

	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	enr, err := h.repo.Create(c.Request().Context(), tenantID, c.Param("id"), inp.StudentID, inp.PaymentStatus)
	if err != nil {
		c.Logger().Errorf("enrollments create: %v", err)
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", "no se pudo inscribir"))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"data": enr})
}

func (h *Handler) Delete(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if err := h.repo.Delete(c.Request().Context(), tenantID, c.Param("eid")); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.NoContent(http.StatusNoContent)
}
