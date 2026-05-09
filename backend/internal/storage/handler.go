package storage

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
)

type Handler struct {
	drive *DriveClient
}

func NewHandler(drive *DriveClient) *Handler {
	return &Handler{drive: drive}
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

	fileID, err := h.drive.Upload(c.Request().Context(), tmpPath, file.Filename, mimeType)
	if err != nil {
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
