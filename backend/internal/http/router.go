package http

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	authpkg "github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/comments"
	"github.com/neusco/ccl-licreamo/backend/internal/config"
	"github.com/neusco/ccl-licreamo/backend/internal/courses"
	"github.com/neusco/ccl-licreamo/backend/internal/coursestructure"
	"github.com/neusco/ccl-licreamo/backend/internal/db"
	"github.com/neusco/ccl-licreamo/backend/internal/enrollments"
	"github.com/neusco/ccl-licreamo/backend/internal/lessons"
	"github.com/neusco/ccl-licreamo/backend/internal/modules"
	"github.com/neusco/ccl-licreamo/backend/internal/progress"
	"github.com/neusco/ccl-licreamo/backend/internal/quizzes"
	"github.com/neusco/ccl-licreamo/backend/internal/storage"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
	"github.com/neusco/ccl-licreamo/backend/internal/users"
)

func NewRouter(cfg *config.Config, database *db.DB) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	e.Use(middleware.RequestID())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"http://localhost", "http://localhost:4200", "http://localhost:8090", "https://ccl.neusco.org"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Tenant-Subdomain", "X-Request-ID"},
		AllowCredentials: true,
	}))
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			reqID := c.Response().Header().Get(echo.HeaderXRequestID)
			slog.Info("request",
				"method", c.Request().Method,
				"path", c.Request().URL.Path,
				"request_id", reqID,
			)
			return next(c)
		}
	})

	e.Use(tenancy.Middleware(database.Pool()))

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	authSvc := authpkg.NewService(database.Pool(), cfg.JWT.Secret, cfg.JWT.AccessTTL, cfg.JWT.RefreshDays)
	authHandler := authpkg.NewHandler(authSvc, cfg.Google)

	e.POST("/auth/login", authHandler.Login)
	e.POST("/auth/refresh", authHandler.Refresh)
	e.GET("/auth/google", authHandler.GoogleRedirect)
	e.GET("/auth/google/callback", authHandler.GoogleCallback)

	protected := e.Group("", authpkg.JWTMiddleware(cfg.JWT.Secret))
	protected.GET("/auth/me", authHandler.Me)

	// Courses
	coursesRepo := courses.NewRepository(database)
	coursesHandler := courses.NewHandler(coursesRepo)
	protected.GET("/courses", coursesHandler.List)
	protected.POST("/courses", coursesHandler.Create)
	protected.GET("/courses/:id", coursesHandler.Get)
	protected.PUT("/courses/:id", coursesHandler.Update)
	protected.DELETE("/courses/:id", coursesHandler.Delete)
	protected.GET("/courses/:id/outline", coursesHandler.Outline)

	// Modules
	modulesRepo := modules.NewRepository(database)
	modulesHandler := modules.NewHandler(modulesRepo)
	protected.POST("/courses/:cid/modules", modulesHandler.Create)
	protected.PUT("/courses/:cid/modules/reorder", modulesHandler.Reorder)
	protected.PUT("/courses/:cid/modules/:id", modulesHandler.Update)
	protected.DELETE("/courses/:cid/modules/:id", modulesHandler.Delete)

	// Lessons
	lessonsRepo := lessons.NewRepository(database)
	lessonsHandler := lessons.NewHandler(lessonsRepo)
	protected.POST("/courses/:cid/modules/:mid/lessons", lessonsHandler.Create)
	protected.PUT("/courses/:cid/modules/:mid/lessons/reorder", lessonsHandler.Reorder)
	protected.PUT("/courses/:cid/modules/:mid/lessons/:id", lessonsHandler.Update)
	protected.DELETE("/courses/:cid/modules/:mid/lessons/:id", lessonsHandler.Delete)
	protected.POST("/lessons/:id/attachments", lessonsHandler.AddAttachment)
	protected.DELETE("/lessons/:id/attachments/:aid", lessonsHandler.DeleteAttachment)

	// Progress
	progressRepo := progress.NewRepository(database)
	progressHandler := progress.NewHandler(progressRepo)
	protected.POST("/lessons/:id/complete", progressHandler.Complete)

	// Quizzes
	quizzesRepo := quizzes.NewRepository(database)
	quizzesHandler := quizzes.NewHandler(quizzesRepo)
	protected.GET("/lessons/:id/quiz", quizzesHandler.Get)
	protected.PUT("/lessons/:id/quiz", quizzesHandler.Save)
	protected.DELETE("/lessons/:id/quiz", quizzesHandler.Delete)
	protected.POST("/lessons/:id/quiz/attempt", quizzesHandler.Attempt)
	protected.POST("/quiz/parse", quizzesHandler.ParseImport)

	// Users (admin/teacher gestión)
	usersRepo := users.NewRepository(database.Pool())
	usersHandler := users.NewHandler(usersRepo)
	protected.GET("/users", usersHandler.List)
	protected.POST("/users", usersHandler.Create)
	protected.PUT("/users/:id", usersHandler.Update)
	protected.DELETE("/users/:id", usersHandler.Delete)

	// Enrollments
	enrollRepo := enrollments.NewRepository(database.Pool())
	enrollHandler := enrollments.NewHandler(enrollRepo)
	protected.GET("/courses/:id/enrollments", enrollHandler.ListByCourse)
	protected.POST("/courses/:id/enrollments", enrollHandler.Create)
	protected.DELETE("/courses/:cid/enrollments/:eid", enrollHandler.Delete)

	// Comments
	commentsRepo := comments.NewRepository(database)
	commentsHandler := comments.NewHandler(commentsRepo)
	protected.GET("/lessons/:id/comments", commentsHandler.List)
	protected.POST("/lessons/:id/comments", commentsHandler.Create)
	protected.DELETE("/lessons/:id/comments/:cid", commentsHandler.Delete)

	// Bulk import de estructura de curso (módulos + clases + quiz final)
	structureHandler := coursestructure.NewHandler(modulesRepo, lessonsRepo, quizzesRepo)
	protected.POST("/courses/:id/structure/preview", structureHandler.PreviewImport)
	protected.POST("/courses/:id/structure/apply", structureHandler.ApplyImport)

	// Storage (upload → Google Drive)
	if cfg.Storage.Enabled {
		driveClient, err := storage.NewDriveClient(context.Background(), cfg.Storage.SAKeyPath, cfg.Storage.FolderID)
		if err != nil {
			slog.Warn("storage: drive client unavailable", "err", err)
		} else {
			storageHandler := storage.NewHandler(driveClient)
			storageHandler.SetCoursesRepo(coursesRepo)
			storageHandler.SetCourseLookup(coursesRepo)
			coursesHandler.SetDrive(driveClient)
			protected.POST("/upload", storageHandler.Upload)
			protected.POST("/upload-video", storageHandler.UploadVideo)
			protected.POST("/drive/make-public", storageHandler.MakePublic)
			protected.GET("/drive/inspect/:id", storageHandler.Inspect)
		}
	}

	return e
}
