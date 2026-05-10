package quizzes

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
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

func (h *Handler) Get(c echo.Context) error {
	tenantID := c.Get("tenant_id").(string)
	lessonID := c.Param("id")
	claims := auth.GetClaims(c)

	quiz, err := h.repo.GetByLesson(c.Request().Context(), tenantID, lessonID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.JSON(http.StatusNotFound, errResp("QUIZ_NOT_FOUND", "no hay quiz para esta clase"))
		}
		return c.JSON(http.StatusInternalServerError, errResp("INTERNAL", err.Error()))
	}

	if claims.Role == auth.RoleStudent {
		for i := range quiz.Questions {
			for j := range quiz.Questions[i].Options {
				quiz.Questions[i].Options[j].IsCorrect = false
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"data": quiz})
}

func (h *Handler) Save(c echo.Context) error {
	tenantID := c.Get("tenant_id").(string)
	lessonID := c.Param("id")
	claims := auth.GetClaims(c)

	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}

	var inp SaveInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("BAD_REQUEST", err.Error()))
	}
	if len(inp.Questions) == 0 {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "el quiz debe tener al menos una pregunta"))
	}

	quiz, err := h.repo.Save(c.Request().Context(), tenantID, lessonID, inp)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("INTERNAL", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": quiz})
}

// ParseImport receives a PDF/DOCX/TXT file, extracts text and returns parsed questions.
// Does NOT save anything; the frontend uses the result to populate the editor.
func (h *Handler) ParseImport(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errResp("MISSING_FILE", "se requiere campo 'file'"))
	}
	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo abrir el archivo"))
	}
	defer src.Close()

	ext := strings.ToLower(filepath.Ext(file.Filename))
	tmpPath := fmt.Sprintf("/tmp/quiz-%s%s", uuid.NewString(), ext)
	dst, err := os.Create(tmpPath)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo crear archivo temporal"))
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(tmpPath)
		return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo escribir archivo temporal"))
	}
	dst.Close()
	defer os.Remove(tmpPath)

	var text string
	switch ext {
	case ".txt", ".md":
		b, e := os.ReadFile(tmpPath)
		if e != nil {
			return c.JSON(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo leer el archivo"))
		}
		text = string(b)
	case ".pdf":
		out, e := exec.Command("pdftotext", "-layout", tmpPath, "-").Output()
		if e != nil {
			c.Logger().Errorf("pdftotext error: %v", e)
			return c.JSON(http.StatusInternalServerError, errResp("PARSE_ERROR", "no se pudo extraer texto del PDF"))
		}
		text = string(out)
	case ".docx", ".doc", ".odt", ".rtf":
		out, e := exec.Command("pandoc", "-f", "docx", "-t", "plain", "--wrap=none", tmpPath).Output()
		if e != nil {
			c.Logger().Errorf("pandoc error: %v", e)
			return c.JSON(http.StatusInternalServerError, errResp("PARSE_ERROR", "no se pudo convertir el documento"))
		}
		text = string(out)
	default:
		return c.JSON(http.StatusBadRequest, errResp("UNSUPPORTED_FORMAT", "formato no soportado: usa .pdf, .docx o .txt"))
	}

	questions := ParseQuiz(text)
	if len(questions) == 0 {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"data":    map[string]interface{}{"questions": []ParsedQuestion{}},
			"warning": "no se detectaron preguntas. Verifica el formato (1. pregunta + a)/b)/c) opciones, *opcion para correcta).",
		})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": map[string]interface{}{"questions": questions}})
}

func (h *Handler) Delete(c echo.Context) error {
	tenantID := c.Get("tenant_id").(string)
	lessonID := c.Param("id")
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}
	if err := h.repo.DeleteByLesson(c.Request().Context(), tenantID, lessonID); err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("INTERNAL", err.Error()))
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) Attempt(c echo.Context) error {
	tenantID := c.Get("tenant_id").(string)
	lessonID := c.Param("id")
	claims := auth.GetClaims(c)

	var inp AttemptInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("BAD_REQUEST", err.Error()))
	}
	if len(inp.Answers) == 0 {
		return c.JSON(http.StatusBadRequest, errResp("VALIDATION", "debes responder al menos una pregunta"))
	}

	result, err := h.repo.SubmitAttempt(c.Request().Context(), tenantID, lessonID, claims.UserID, inp)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, errResp("INTERNAL", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": result})
}
