package payments

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

// DriveUploader is the minimal interface this handler needs from storage.DriveClient.
// We avoid importing storage to keep packages decoupled.
type DriveUploader interface {
	CreateFolder(ctx context.Context, name, parentID string) (string, error)
	UploadTo(ctx context.Context, localPath, name, mimeType, parentID string) (string, error)
	MakePublic(ctx context.Context, fileID string) error
}

// CourseFolders permite localizar la carpeta de Drive del curso y la
// subcarpeta de "Pagos" para almacenar comprobantes ordenadamente.
type CourseFolders interface {
	GetDriveFolder(ctx context.Context, tenantID, courseID string) (string, error)
	GetPaymentsFolder(ctx context.Context, tenantID, courseID string) (string, error)
	SetPaymentsFolder(ctx context.Context, tenantID, courseID, folderID string) error
	EnrollmentCourse(ctx context.Context, tenantID, enrollmentID string) (string, error)
}

type Handler struct {
	repo    *Repository
	drive   DriveUploader
	courses CourseFolders
}

func NewHandler(repo *Repository, drive DriveUploader) *Handler {
	return &Handler{repo: repo, drive: drive}
}

func (h *Handler) SetCourseFolders(c CourseFolders) {
	h.courses = c
}

// resolveReceiptsFolder devuelve el ID de la subcarpeta "Pagos" del curso al
// que pertenece la inscripción. Si no existe la crea dentro de la carpeta del
// curso. Si no hay carpeta de curso o falla la consulta, retorna "" (fallback
// a la raíz del shared drive).
func (h *Handler) resolveReceiptsFolder(ctx context.Context, tenantID, enrollmentID string) string {
	if h.drive == nil || h.courses == nil {
		return ""
	}
	courseID, err := h.courses.EnrollmentCourse(ctx, tenantID, enrollmentID)
	if err != nil || courseID == "" {
		return ""
	}
	if existing, err := h.courses.GetPaymentsFolder(ctx, tenantID, courseID); err == nil && existing != "" {
		return existing
	}
	parent, _ := h.courses.GetDriveFolder(ctx, tenantID, courseID)
	folder, err := h.drive.CreateFolder(ctx, "Pagos", parent)
	if err != nil || folder == "" {
		return ""
	}
	_ = h.courses.SetPaymentsFolder(ctx, tenantID, courseID, folder)
	return folder
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}

// Upload accepts a multipart request with:
//   - enrollment_id (required)
//   - include_enrollment_fee="true" — agregar la cuota de inscripción
//   - periods — JSON [{year,month}], lista de mensualidades a pagar (puede estar vacío)
//   - file — el comprobante (Drive upload)
//
// El monto de cada línea se toma de courses.enrollment_fee / courses.price; el
// alumno no manda montos para evitar discrepancias.
func (h *Handler) Upload(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	enrollmentID := c.FormValue("enrollment_id")
	periodsRaw := c.FormValue("periods")
	includeFee := c.FormValue("include_enrollment_fee") == "true"
	driveFileIDInput := strings.TrimSpace(c.FormValue("drive_file_id"))

	if enrollmentID == "" {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "enrollment_id es requerido"))
	}

	var periods []Period
	if periodsRaw != "" {
		if err := json.Unmarshal([]byte(periodsRaw), &periods); err != nil {
			return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "periods debe ser JSON [{year, month}]"))
		}
		for _, p := range periods {
			if p.Month < 1 || p.Month > 12 || p.Year < 2020 || p.Year > 2100 {
				return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "periodo fuera de rango"))
			}
		}
	}
	if !includeFee && len(periods) == 0 {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "agrega al menos un concepto (inscripción o mensualidad)"))
	}

	info, err := h.repo.GetEnrollmentInfo(c.Request().Context(), tenantID, enrollmentID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	if info == nil {
		return c.JSON(http.StatusNotFound, errResp("NOT_FOUND", "inscripción no encontrada"))
	}
	if claims.Role == auth.RoleStudent && info.StudentID != claims.UserID {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "no puedes pagar por otro alumno"))
	}
	if claims.Role == auth.RoleTeacher {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "profesores no suben comprobantes"))
	}

	driveFileID := ""
	if driveFileIDInput != "" {
		// Caso A: el usuario eligió un archivo desde Drive (Picker). Lo hacemos
		// público con la cuenta de servicio y lo usamos directamente.
		if h.drive == nil {
			return c.JSON(http.StatusServiceUnavailable, errResp("DRIVE_DISABLED", "drive no está configurado"))
		}
		if err := h.drive.MakePublic(c.Request().Context(), driveFileIDInput); err != nil {
			c.Logger().Errorf("payments drive make-public: %v", err)
			return c.JSON(http.StatusInternalServerError, errResp("DRIVE_ERROR", "no se pudo dar acceso al archivo"))
		}
		driveFileID = driveFileIDInput
	} else {
		// Caso B: archivo local subido por el cliente (image/pdf).
		file, err := c.FormFile("file")
		if err != nil {
			return c.JSON(http.StatusBadRequest, errResp("MISSING_FILE", "archivo de comprobante requerido"))
		}
		src, err := file.Open()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "cannot open uploaded file"))
		}
		defer src.Close()

		ext := filepath.Ext(file.Filename)
		tmpPath := fmt.Sprintf("/tmp/licreamo-receipt-%s%s", uuid.NewString(), ext)
		dst, err := os.Create(tmpPath)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "cannot create temp file"))
		}
		buf := make([]byte, 32*1024)
		for {
			n, readErr := src.Read(buf)
			if n > 0 {
				if _, werr := dst.Write(buf[:n]); werr != nil {
					dst.Close()
					os.Remove(tmpPath)
					return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "write error"))
				}
			}
			if readErr != nil {
				break
			}
		}
		dst.Close()
		defer os.Remove(tmpPath)

		mimeType := file.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		if h.drive != nil {
			safeCourse := strings.ReplaceAll(strings.ToLower(info.CourseTitle), " ", "-")
			if len(safeCourse) > 30 {
				safeCourse = safeCourse[:30]
			}
			tag := "ins"
			if len(periods) > 0 {
				tag = fmt.Sprintf("%04d%02d", periods[0].Year, periods[0].Month)
			}
			name := fmt.Sprintf("comp-%s-%s-%s%s", safeCourse, tag, uuid.NewString()[:6], ext)
			parentFolder := h.resolveReceiptsFolder(c.Request().Context(), tenantID, enrollmentID)
			fid, uerr := h.drive.UploadTo(c.Request().Context(), tmpPath, name, mimeType, parentFolder)
			if uerr != nil {
				c.Logger().Errorf("payments drive upload: %v", uerr)
				return c.JSON(http.StatusInternalServerError, errResp("DRIVE_ERROR", "fallo al subir comprobante"))
			}
			driveFileID = fid
		}
	}
	receiptURL := ""
	if driveFileID != "" {
		receiptURL = fmt.Sprintf("https://drive.google.com/file/d/%s/view", driveFileID)
	}

	items := []LineItem{}
	if includeFee {
		items = append(items, LineItem{Kind: KindEnrollment, Amount: info.EnrollmentFee})
	}
	for _, p := range periods {
		items = append(items, LineItem{Kind: KindMonthly, Year: p.Year, Month: p.Month, Amount: info.MonthlyFee})
	}

	rows, err := h.repo.CreateGroup(c.Request().Context(), tenantID, enrollmentID, receiptURL, items)
	if err != nil {
		c.Logger().Errorf("payments create: %v", err)
		msg := err.Error()
		if strings.Contains(msg, "payments_enrollment_period_unique") {
			return c.JSON(http.StatusConflict, errResp("PERIOD_TAKEN", "uno de los meses ya tiene un pago registrado"))
		}
		if strings.Contains(msg, "payments_enrollment_fee_unique") {
			return c.JSON(http.StatusConflict, errResp("FEE_TAKEN", "la inscripción ya tiene un pago registrado"))
		}
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"data": rows})
}

type cashInput struct {
	EnrollmentID          string   `json:"enrollment_id"`
	IncludeEnrollmentFee  bool     `json:"include_enrollment_fee"`
	Periods               []Period `json:"periods"`
}

// CashPayment registra un pago en efectivo (sin comprobante). Solo admin.
func (h *Handler) CashPayment(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin puede registrar efectivo"))
	}
	var inp cashInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "body inválido"))
	}
	if inp.EnrollmentID == "" {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "enrollment_id requerido"))
	}
	if !inp.IncludeEnrollmentFee && len(inp.Periods) == 0 {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "agrega al menos un concepto"))
	}
	for _, p := range inp.Periods {
		if p.Month < 1 || p.Month > 12 || p.Year < 2020 || p.Year > 2100 {
			return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "periodo fuera de rango"))
		}
	}

	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	info, err := h.repo.GetEnrollmentInfo(c.Request().Context(), tenantID, inp.EnrollmentID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	if info == nil {
		return c.JSON(http.StatusNotFound, errResp("NOT_FOUND", "inscripción no encontrada"))
	}

	items := []LineItem{}
	if inp.IncludeEnrollmentFee {
		items = append(items, LineItem{Kind: KindEnrollment, Amount: info.EnrollmentFee})
	}
	for _, p := range inp.Periods {
		items = append(items, LineItem{Kind: KindMonthly, Year: p.Year, Month: p.Month, Amount: info.MonthlyFee})
	}

	rows, err := h.repo.CreateCashGroup(c.Request().Context(), tenantID, inp.EnrollmentID, claims.UserID, items)
	if err != nil {
		c.Logger().Errorf("payments cash: %v", err)
		msg := err.Error()
		if strings.Contains(msg, "payments_enrollment_period_unique") {
			return c.JSON(http.StatusConflict, errResp("PERIOD_TAKEN", "ya existe un pago para ese mes"))
		}
		if strings.Contains(msg, "payments_enrollment_fee_unique") {
			return c.JSON(http.StatusConflict, errResp("FEE_TAKEN", "la inscripción ya está pagada"))
		}
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusCreated, map[string]interface{}{"data": rows})
}

func (h *Handler) ListPending(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	out, err := h.repo.ListPending(c.Request().Context(), tenantID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": out})
}

func (h *Handler) ListMine(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	out, err := h.repo.ListByStudent(c.Request().Context(), tenantID, claims.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": out})
}

// ListByEnrollment muestra el histórico de una inscripción. Solo el alumno dueño o admin.
func (h *Handler) ListByEnrollment(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	enrollmentID := c.Param("eid")
	info, err := h.repo.GetEnrollmentInfo(c.Request().Context(), tenantID, enrollmentID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	if info == nil {
		return c.JSON(http.StatusNotFound, errResp("NOT_FOUND", "inscripción no encontrada"))
	}
	if claims.Role == auth.RoleStudent && info.StudentID != claims.UserID {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "no puedes ver pagos de otro alumno"))
	}
	out, err := h.repo.ListByEnrollment(c.Request().Context(), tenantID, enrollmentID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	pending, _ := h.repo.PendingMonths(c.Request().Context(), tenantID, enrollmentID, info.EnrolledAt)
	feeStatus, _ := h.repo.EnrollmentFeeStatus(c.Request().Context(), tenantID, enrollmentID)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":             out,
		"pending_periods":  pending,
		"monthly_fee":      info.MonthlyFee,
		"enrollment_fee":   info.EnrollmentFee,
		"enrollment_fee_status": feeStatus,
		"course_title":     info.CourseTitle,
		"enrolled_at":      info.EnrolledAt.Format(time.RFC3339),
	})
}

func (h *Handler) VerifyGroup(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	groupID := c.Param("gid")
	if err := h.repo.VerifyGroup(c.Request().Context(), tenantID, groupID, claims.UserID); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}

type rejectInput struct {
	Reason string `json:"reason"`
}

func (h *Handler) RejectGroup(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role != auth.RoleAdmin {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "solo admin"))
	}
	var inp rejectInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "body inválido"))
	}
	inp.Reason = strings.TrimSpace(inp.Reason)
	if inp.Reason == "" {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "reason requerido"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	groupID := c.Param("gid")
	if err := h.repo.RejectGroup(c.Request().Context(), tenantID, groupID, claims.UserID, inp.Reason); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}
