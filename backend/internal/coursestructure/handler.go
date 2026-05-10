package coursestructure

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/lessons"
	"github.com/neusco/ccl-licreamo/backend/internal/modules"
	"github.com/neusco/ccl-licreamo/backend/internal/quizzes"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

type Handler struct {
	modulesRepo *modules.Repository
	lessonsRepo *lessons.Repository
	quizzesRepo *quizzes.Repository
}

func NewHandler(m *modules.Repository, l *lessons.Repository, q *quizzes.Repository) *Handler {
	return &Handler{modulesRepo: m, lessonsRepo: l, quizzesRepo: q}
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}

// PreviewImport recibe un archivo (txt/pdf/docx) y devuelve la estructura parseada para preview.
// No persiste nada.
func (h *Handler) PreviewImport(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}
	text, err := extractText(c)
	if err != nil {
		return err
	}
	parsed := Parse(text)
	if len(parsed.Modules) == 0 && parsed.Quiz == nil {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"data":    parsed,
			"warning": "no se detectaron módulos ni quiz. Verifica el formato (# MÓDULO: ..., ## CLASE: ...).",
		})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": parsed})
}

// ApplyImport recibe la estructura JSON ya editada y la persiste en BD para el curso.
func (h *Handler) ApplyImport(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return c.JSON(http.StatusForbidden, errResp("FORBIDDEN", "sin permiso"))
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	courseID := c.Param("id")

	var inp ParsedStructure
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", err.Error()))
	}

	createdModules := 0
	createdLessons := 0
	createdQuiz := false

	ctx := c.Request().Context()
	for _, m := range inp.Modules {
		if strings.TrimSpace(m.Title) == "" {
			continue
		}
		mod, err := h.modulesRepo.Create(ctx, tenantID, courseID, modules.CreateModuleInput{Title: m.Title})
		if err != nil {
			c.Logger().Errorf("apply create module %s: %v", m.Title, err)
			continue
		}
		createdModules++
		for _, l := range m.Lessons {
			if strings.TrimSpace(l.Title) == "" {
				continue
			}
			_, err := h.lessonsRepo.Create(ctx, tenantID, mod.ID, lessons.CreateLessonInput{
				Title:                l.Title,
				Description:          l.Description,
				VideoStorageProvider: "drive",
				VideoStorageRef:      "",
				DurationSeconds:      0,
			})
			if err != nil {
				c.Logger().Errorf("apply create lesson %s: %v", l.Title, err)
				continue
			}
			createdLessons++
		}
	}

	// Quiz final → crear lesson "Examen final" en último módulo (o crearlo si no hay).
	if inp.Quiz != nil && len(inp.Quiz.Questions) > 0 {
		var targetModuleID string
		if len(inp.Modules) > 0 {
			// reusa el último módulo creado
			modList, _ := h.modulesRepo.ListByCourse(ctx, tenantID, courseID)
			if len(modList) > 0 {
				targetModuleID = modList[len(modList)-1].ID
			}
		}
		if targetModuleID == "" {
			mod, err := h.modulesRepo.Create(ctx, tenantID, courseID, modules.CreateModuleInput{Title: "Evaluación final"})
			if err == nil {
				targetModuleID = mod.ID
				createdModules++
			}
		}
		if targetModuleID != "" {
			lesson, err := h.lessonsRepo.Create(ctx, tenantID, targetModuleID, lessons.CreateLessonInput{
				Title:                "Examen final",
				Description:          "Evaluación que cubre los temas del curso.",
				VideoStorageProvider: "drive",
				VideoStorageRef:      "",
				DurationSeconds:      0,
			})
			if err == nil {
				createdLessons++
				questions := make([]quizzes.QuestionInput, 0, len(inp.Quiz.Questions))
				for _, q := range inp.Quiz.Questions {
					opts := make([]quizzes.OptionInput, 0, len(q.Options))
					for _, o := range q.Options {
						opts = append(opts, quizzes.OptionInput{Text: o.Text, IsCorrect: o.IsCorrect})
					}
					questions = append(questions, quizzes.QuestionInput{Text: q.Text, Options: opts})
				}
				if _, err := h.quizzesRepo.Save(ctx, tenantID, lesson.ID, quizzes.SaveInput{
					PassScore: inp.Quiz.PassScore,
					Questions: questions,
				}); err == nil {
					createdQuiz = true
				}
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data": map[string]interface{}{
			"modules_created": createdModules,
			"lessons_created": createdLessons,
			"quiz_created":    createdQuiz,
		},
	})
}

// ===== file extraction =====

func extractText(c echo.Context) (string, error) {
	file, err := c.FormFile("file")
	if err != nil {
		return "", echo.NewHTTPError(http.StatusBadRequest, errResp("MISSING_FILE", "se requiere campo 'file'"))
	}
	src, err := file.Open()
	if err != nil {
		return "", echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo abrir el archivo"))
	}
	defer src.Close()

	ext := strings.ToLower(filepath.Ext(file.Filename))
	tmpPath := fmt.Sprintf("/tmp/structure-%s%s", uuid.NewString(), ext)
	dst, err := os.Create(tmpPath)
	if err != nil {
		return "", echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo crear archivo temporal"))
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(tmpPath)
		return "", echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo escribir archivo temporal"))
	}
	dst.Close()
	defer os.Remove(tmpPath)

	switch ext {
	case ".txt", ".md":
		b, err := os.ReadFile(tmpPath)
		if err != nil {
			return "", echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "no se pudo leer el archivo"))
		}
		return string(b), nil
	case ".pdf":
		out, err := exec.CommandContext(c.Request().Context(), "pdftotext", "-layout", tmpPath, "-").Output()
		if err != nil {
			return "", echo.NewHTTPError(http.StatusInternalServerError, errResp("PARSE_ERROR", "no se pudo extraer texto del PDF"))
		}
		return string(out), nil
	case ".docx", ".doc", ".odt", ".rtf":
		out, err := exec.CommandContext(c.Request().Context(), "pandoc", "-f", "docx", "-t", "plain", "--wrap=none", tmpPath).Output()
		if err != nil {
			return "", echo.NewHTTPError(http.StatusInternalServerError, errResp("PARSE_ERROR", "no se pudo convertir el documento"))
		}
		return string(out), nil
	}
	return "", echo.NewHTTPError(http.StatusBadRequest, errResp("UNSUPPORTED_FORMAT", "formato no soportado: usa .pdf, .docx, .txt o .md"))
}

// minimal context import shadow to keep formatting predictable
var _ = context.Background
