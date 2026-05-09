package http

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	authpkg "github.com/neusco/ccl-licreamo/backend/internal/auth"
	"github.com/neusco/ccl-licreamo/backend/internal/config"
	"github.com/neusco/ccl-licreamo/backend/internal/courses"
	"github.com/neusco/ccl-licreamo/backend/internal/db"
	"github.com/neusco/ccl-licreamo/backend/internal/lessons"
	"github.com/neusco/ccl-licreamo/backend/internal/modules"
	"github.com/neusco/ccl-licreamo/backend/internal/progress"
	"github.com/neusco/ccl-licreamo/backend/internal/storage"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
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

	// Storage (upload → Google Drive)
	if cfg.Storage.Enabled {
		driveClient, err := storage.NewDriveClient(context.Background(), cfg.Storage.SAKeyPath, cfg.Storage.FolderID)
		if err != nil {
			slog.Warn("storage: drive client unavailable", "err", err)
		} else {
			storageHandler := storage.NewHandler(driveClient)
			protected.POST("/upload", storageHandler.Upload)
		}
	}

	return e
}
