package courses

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"

	"github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

type OutlineAttachment struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	DriveFileID string    `json:"drive_file_id"`
	MimeType    string    `json:"mime_type"`
	OrderIndex  int       `json:"order_index"`
}

type OutlineLesson struct {
	ID                   string              `json:"id"`
	Title                string              `json:"title"`
	Description          string              `json:"description"`
	OrderIndex           int                 `json:"order_index"`
	VideoStorageProvider string              `json:"video_storage_provider"`
	VideoStorageRef      string              `json:"video_storage_ref"`
	DurationSeconds      int                 `json:"duration_seconds"`
	Attachments          []OutlineAttachment `json:"attachments"`
	Completed            bool                `json:"completed"`
}

type OutlineModule struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	OrderIndex  int             `json:"order_index"`
	Lessons     []OutlineLesson `json:"lessons"`
}

type OutlineEnrollment struct {
	ID            string    `json:"id"`
	PaymentStatus string    `json:"payment_status"`
	EnrolledAt    time.Time `json:"enrolled_at"`
}

type Outline struct {
	Course     *Course           `json:"course"`
	Modules    []OutlineModule   `json:"modules"`
	Enrollment *OutlineEnrollment `json:"enrollment"`
}

func (r *Repository) GetOutline(ctx context.Context, tenantID, courseID, userID string, isStudent bool) (*Outline, error) {
	outline := &Outline{Modules: []OutlineModule{}}

	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		// Course
		var c Course
		err := tx.QueryRow(ctx,
			`SELECT id, tenant_id, teacher_id, title, description,
			        COALESCE(cover_image_url,''), price::text, status, created_at, updated_at
			 FROM courses WHERE id = $1`,
			courseID,
		).Scan(&c.ID, &c.TenantID, &c.TeacherID, &c.Title,
			&c.Description, &c.CoverImageURL, &c.Price, &c.Status,
			&c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return fmt.Errorf("outline: course: %w", err)
		}
		outline.Course = &c

		// Enrollment (if student)
		var enrollmentID string
		if isStudent {
			var enr OutlineEnrollment
			err := tx.QueryRow(ctx,
				`SELECT id, payment_status::text, enrolled_at FROM enrollments
				 WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
				userID, courseID,
			).Scan(&enr.ID, &enr.PaymentStatus, &enr.EnrolledAt)
			if err != nil && err != pgx.ErrNoRows {
				return fmt.Errorf("outline: enrollment: %w", err)
			}
			if err == nil {
				outline.Enrollment = &enr
				enrollmentID = enr.ID
			}
		}

		// Modules
		mRows, err := tx.Query(ctx,
			`SELECT id, title, description, order_index FROM modules
			 WHERE course_id = $1 ORDER BY order_index, created_at`,
			courseID,
		)
		if err != nil {
			return fmt.Errorf("outline: modules: %w", err)
		}
		defer mRows.Close()
		moduleIDs := []string{}
		for mRows.Next() {
			var m OutlineModule
			m.Lessons = []OutlineLesson{}
			if err := mRows.Scan(&m.ID, &m.Title, &m.Description, &m.OrderIndex); err != nil {
				return err
			}
			outline.Modules = append(outline.Modules, m)
			moduleIDs = append(moduleIDs, m.ID)
		}
		if err := mRows.Err(); err != nil {
			return err
		}
		if len(moduleIDs) == 0 {
			return nil
		}

		// Lessons for all modules
		lRows, err := tx.Query(ctx,
			`SELECT id, module_id, title, description, order_index,
			        COALESCE(video_storage_provider::text,''), COALESCE(video_storage_ref,''),
			        COALESCE(duration_seconds,0)
			 FROM lessons WHERE module_id = ANY($1) ORDER BY order_index, created_at`,
			moduleIDs,
		)
		if err != nil {
			return fmt.Errorf("outline: lessons: %w", err)
		}
		defer lRows.Close()

		lessonMap := map[string]*OutlineLesson{}
		moduleIndex := map[string]int{}
		for i, m := range outline.Modules {
			moduleIndex[m.ID] = i
		}

		lessonIDs := []string{}
		for lRows.Next() {
			var l OutlineLesson
			var moduleID string
			l.Attachments = []OutlineAttachment{}
			if err := lRows.Scan(&l.ID, &moduleID, &l.Title, &l.Description, &l.OrderIndex,
				&l.VideoStorageProvider, &l.VideoStorageRef, &l.DurationSeconds); err != nil {
				return err
			}
			if idx, ok := moduleIndex[moduleID]; ok {
				outline.Modules[idx].Lessons = append(outline.Modules[idx].Lessons, l)
				last := &outline.Modules[idx].Lessons[len(outline.Modules[idx].Lessons)-1]
				lessonMap[l.ID] = last
				lessonIDs = append(lessonIDs, l.ID)
			}
		}
		if err := lRows.Err(); err != nil {
			return err
		}
		if len(lessonIDs) == 0 {
			return nil
		}

		// Attachments
		aRows, err := tx.Query(ctx,
			`SELECT id, lesson_id, name, drive_file_id, mime_type, order_index
			 FROM lesson_attachments WHERE lesson_id = ANY($1) ORDER BY order_index`,
			lessonIDs,
		)
		if err != nil {
			return fmt.Errorf("outline: attachments: %w", err)
		}
		defer aRows.Close()
		for aRows.Next() {
			var a OutlineAttachment
			var lessonID string
			if err := aRows.Scan(&a.ID, &lessonID, &a.Name, &a.DriveFileID, &a.MimeType, &a.OrderIndex); err != nil {
				return err
			}
			if l, ok := lessonMap[lessonID]; ok {
				l.Attachments = append(l.Attachments, a)
			}
		}
		if err := aRows.Err(); err != nil {
			return err
		}

		// Progress (if enrolled student)
		if enrollmentID == "" {
			return nil
		}
		pRows, err := tx.Query(ctx,
			`SELECT lesson_id FROM lesson_progress WHERE enrollment_id = $1`,
			enrollmentID,
		)
		if err != nil {
			return fmt.Errorf("outline: progress: %w", err)
		}
		defer pRows.Close()
		for pRows.Next() {
			var lessonID string
			if err := pRows.Scan(&lessonID); err != nil {
				return err
			}
			if l, ok := lessonMap[lessonID]; ok {
				l.Completed = true
			}
		}
		return pRows.Err()
	})
	return outline, err
}

func (h *Handler) Outline(c echo.Context) error {
	claims := auth.GetClaims(c)
	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)

	outline, err := h.repo.GetOutline(
		c.Request().Context(), tenantID, c.Param("id"),
		claims.UserID, claims.Role == auth.RoleStudent,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("DB_ERROR", "failed to load outline"))
	}
	if outline.Course == nil {
		return echo.NewHTTPError(http.StatusNotFound, errResp("NOT_FOUND", "course not found"))
	}
	if claims.Role == auth.RoleStudent && outline.Enrollment == nil {
		return echo.NewHTTPError(http.StatusForbidden, errResp("NOT_ENROLLED", "you are not enrolled in this course"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "ok", "data": outline})
}
