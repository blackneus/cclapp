package storage

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

// CoursesRepo describes the subset of courses.Repository methods needed here.
type CoursesRepo interface {
	GetDriveFolder(ctx context.Context, tenantID, courseID string) (string, error)
	SetDriveFolder(ctx context.Context, tenantID, courseID, folderID string) error
}

// CourseLookup is used to fetch the course title when lazily creating a folder.
type CourseLookup interface {
	GetTitle(ctx context.Context, tenantID, courseID string) (string, error)
}

type Handler struct {
	drive       *DriveClient
	courses     CoursesRepo
	courseTitle CourseLookup
}

func NewHandler(drive *DriveClient) *Handler {
	return &Handler{drive: drive}
}

func (h *Handler) SetCoursesRepo(r CoursesRepo) {
	h.courses = r
}

func (h *Handler) SetCourseLookup(l CourseLookup) {
	h.courseTitle = l
}

// resolveParent looks up the course folder ID; creates one lazily if missing.
func (h *Handler) resolveParent(c echo.Context) string {
	courseID := c.QueryParam("course_id")
	if courseID == "" || h.courses == nil {
		return ""
	}
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	if tenantID == "" {
		return ""
	}
	folder, err := h.courses.GetDriveFolder(c.Request().Context(), tenantID, courseID)
	if err != nil {
		c.Logger().Warnf("resolveParent get: %v", err)
		return ""
	}
	if folder != "" {
		return folder
	}
	// Lazy create folder for legacy courses
	title := "Curso " + courseID[:8]
	if h.courseTitle != nil {
		if t, err := h.courseTitle.GetTitle(c.Request().Context(), tenantID, courseID); err == nil && t != "" {
			title = t
		}
	}
	created, err := h.drive.CreateFolder(c.Request().Context(), title, "")
	if err != nil {
		c.Logger().Warnf("resolveParent create: %v", err)
		return ""
	}
	if uerr := h.courses.SetDriveFolder(c.Request().Context(), tenantID, courseID, created); uerr != nil {
		c.Logger().Warnf("resolveParent save: %v", uerr)
	}
	return created
}

func (h *Handler) Upload(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot upload files"))
	}

	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("MISSING_FILE", "file field is required"))
	}

	src, err := file.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "cannot open uploaded file"))
	}
	defer src.Close()

	ext := filepath.Ext(file.Filename)
	tmpPath := fmt.Sprintf("/tmp/licreamo-%s%s", uuid.NewString(), ext)
	dst, err := os.Create(tmpPath)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "cannot create temp file"))
	}

	buf := make([]byte, 32*1024)
	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, werr := dst.Write(buf[:n]); werr != nil {
				dst.Close()
				os.Remove(tmpPath)
				return echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "write error"))
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

	parent := h.resolveParent(c)
	fileID, err := h.drive.UploadTo(c.Request().Context(), tmpPath, file.Filename, mimeType, parent)
	if err != nil {
		c.Logger().Errorf("drive upload error: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DRIVE_ERROR", "failed to upload to Google Drive"))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "uploaded",
		"data": map[string]string{
			"file_id":   fileID,
			"name":      file.Filename,
			"mime_type": mimeType,
		},
	})
}

func errResp(code, msg string) map[string]interface{} {
	return map[string]interface{}{"error": map[string]interface{}{"code": code, "message": msg}}
}

// UploadVideo: recibe video original, lo comprime con ffmpeg (H.264 720p, AAC),
// sube comprimido a Drive, borra ambos temps. Retorna file_id + duration_seconds.
func (h *Handler) UploadVideo(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot upload files"))
	}

	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("MISSING_FILE", "file field is required"))
	}
	src, err := file.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "cannot open uploaded file"))
	}
	defer src.Close()

	id := uuid.NewString()
	origPath := fmt.Sprintf("/tmp/licreamo-vid-%s%s", id, filepath.Ext(file.Filename))
	dst, err := os.Create(origPath)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "cannot create temp file"))
	}
	buf := make([]byte, 64*1024)
	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, werr := dst.Write(buf[:n]); werr != nil {
				dst.Close()
				os.Remove(origPath)
				return echo.NewHTTPError(http.StatusInternalServerError, errResp("IO_ERROR", "write error"))
			}
		}
		if readErr != nil {
			break
		}
	}
	dst.Close()
	defer os.Remove(origPath)

	origInfo, _ := os.Stat(origPath)
	origSize := int64(0)
	if origInfo != nil {
		origSize = origInfo.Size()
	}

	// Comprimir: H.264, 720p (escala solo si es más grande), CRF 28, AAC 128k, faststart.
	compPath := fmt.Sprintf("/tmp/licreamo-vid-%s-comp.mp4", id)
	defer os.Remove(compPath)
	cmd := exec.CommandContext(c.Request().Context(), "ffmpeg",
		"-y", "-i", origPath,
		"-vf", "scale='min(1280,iw)':-2",
		"-c:v", "libx264", "-preset", "fast", "-crf", "28",
		"-c:a", "aac", "-b:a", "128k",
		"-movflags", "+faststart",
		compPath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		c.Logger().Errorf("ffmpeg compress error: %v\n%s", err, string(out))
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("COMPRESS_ERROR", "no se pudo comprimir el video"))
	}

	// Duración con ffprobe
	durSec := 0
	probe := exec.CommandContext(c.Request().Context(), "ffprobe",
		"-v", "error", "-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1", compPath,
	)
	if out, err := probe.Output(); err == nil {
		if f, perr := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); perr == nil {
			durSec = int(f)
		}
	}

	compInfo, _ := os.Stat(compPath)
	compSize := int64(0)
	if compInfo != nil {
		compSize = compInfo.Size()
	}

	// Nombre amigable: original sin extensión + .mp4
	baseName := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	finalName := baseName + ".mp4"

	parent := h.resolveParent(c)
	fileID, err := h.drive.UploadTo(c.Request().Context(), compPath, finalName, "video/mp4", parent)
	if err != nil {
		c.Logger().Errorf("drive upload (compressed) error: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DRIVE_ERROR", "no se pudo subir el video a Drive"))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "uploaded",
		"data": map[string]interface{}{
			"file_id":          fileID,
			"name":             finalName,
			"mime_type":        "video/mp4",
			"duration_seconds": durSec,
			"original_size":    origSize,
			"compressed_size":  compSize,
		},
	})
}

type makePublicInput struct {
	FileID string `json:"file_id"`
}

func (h *Handler) Inspect(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot inspect files"))
	}
	info, err := h.drive.Inspect(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DRIVE_ERROR", err.Error()))
	}
	return c.JSON(http.StatusOK, info)
}

func (h *Handler) MakePublic(c echo.Context) error {
	claims := auth.GetClaims(c)
	if claims.Role == auth.RoleStudent {
		return echo.NewHTTPError(http.StatusForbidden, errResp("FORBIDDEN", "students cannot share files"))
	}
	var inp makePublicInput
	if err := c.Bind(&inp); err != nil || inp.FileID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "file_id requerido"))
	}
	if err := h.drive.MakePublic(c.Request().Context(), inp.FileID); err != nil {
		c.Logger().Errorf("drive make public: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DRIVE_ERROR", "no se pudo hacer público el archivo"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "ok"})
}
