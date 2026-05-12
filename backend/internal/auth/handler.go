package auth

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v4"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/neusco/ccl-licreamo/backend/internal/config"
	"github.com/neusco/ccl-licreamo/backend/internal/tenancy"
)

type Handler struct {
	svc           *Service
	googleOAuth   *oauth2.Config
	frontendURL   string
	googleEnabled bool
}

func NewHandler(svc *Service, cfg config.GoogleConfig) *Handler {
	h := &Handler{
		svc:           svc,
		frontendURL:   cfg.FrontendURL,
		googleEnabled: cfg.Enabled,
	}
	if cfg.Enabled {
		h.googleOAuth = &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURI,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		}
	}
	return h
}

func (h *Handler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "invalid request body"))
	}

	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	pair, user, err := h.svc.Login(c.Request().Context(), tenantID, req)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, errResp("INVALID_CREDENTIALS", "invalid email or password"))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "login successful",
		"data": map[string]interface{}{
			"access_token":  pair.AccessToken,
			"refresh_token": pair.RefreshToken,
			"expires_in":    pair.ExpiresIn,
			"user": map[string]interface{}{
				"id":        user.ID,
				"email":     user.Email,
				"full_name": user.FullName,
				"role":      user.Role,
				"tenant_id": user.TenantID,
			},
		},
	})
}

func (h *Handler) Refresh(c echo.Context) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.Bind(&body); err != nil || body.RefreshToken == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_BODY", "refresh_token required"))
	}
	pair, err := h.svc.Refresh(c.Request().Context(), body.RefreshToken)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, errResp("INVALID_TOKEN", err.Error()))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "token refreshed",
		"data":    pair,
	})
}

func (h *Handler) Me(c echo.Context) error {
	claims := GetClaims(c)
	p, err := h.svc.GetProfile(c.Request().Context(), claims.TenantID, claims.UserID)
	if err != nil || p == nil {
		// Fallback a info mínima del token si falla la BD.
		return c.JSON(http.StatusOK, map[string]interface{}{
			"message": "ok",
			"data": map[string]interface{}{
				"id":        claims.UserID,
				"email":     claims.Email,
				"role":      claims.Role,
				"tenant_id": claims.TenantID,
			},
		})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"message": "ok", "data": p})
}

func (h *Handler) UpdateMe(c echo.Context) error {
	claims := GetClaims(c)
	var inp UpdateProfileInput
	if err := c.Bind(&inp); err != nil {
		return c.JSON(http.StatusBadRequest, errResp("INVALID_BODY", "body inválido"))
	}
	p, err := h.svc.UpdateProfile(c.Request().Context(), claims.TenantID, claims.UserID, inp)
	if err != nil {
		c.Logger().Errorf("update profile: %v", err)
		return c.JSON(http.StatusInternalServerError, errResp("DB_ERROR", "no se pudo actualizar el perfil"))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"data": p})
}

func (h *Handler) GoogleRedirect(c echo.Context) error {
	if !h.googleEnabled {
		return echo.NewHTTPError(http.StatusNotImplemented, errResp("GOOGLE_DISABLED", "Google OAuth not configured"))
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	c.SetCookie(&http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   300,
	})
	url := h.googleOAuth.AuthCodeURL(state, oauth2.AccessTypeOnline)
	return c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *Handler) GoogleCallback(c echo.Context) error {
	if !h.googleEnabled {
		return echo.NewHTTPError(http.StatusNotImplemented, errResp("GOOGLE_DISABLED", "Google OAuth not configured"))
	}

	stateCookie, err := c.Cookie("oauth_state")
	if err != nil || stateCookie.Value != c.QueryParam("state") {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("INVALID_STATE", "invalid oauth state"))
	}

	code := c.QueryParam("code")
	if code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("MISSING_CODE", "missing authorization code"))
	}

	oauthToken, err := h.googleOAuth.Exchange(c.Request().Context(), code)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, errResp("TOKEN_EXCHANGE_FAILED", "failed to exchange code"))
	}

	client := h.googleOAuth.Client(c.Request().Context(), oauthToken)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v3/userinfo")
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("USERINFO_FAILED", "failed to get user info"))
	}
	defer resp.Body.Close()

	var userInfo struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("USERINFO_PARSE_FAILED", "failed to parse user info"))
	}

	tenantID, _ := c.Get(tenancy.CtxKeyTenantID).(string)
	pair, _, err := h.svc.LoginOrCreateGoogle(c.Request().Context(), tenantID, userInfo.Sub, userInfo.Email, userInfo.Name)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, errResp("AUTH_FAILED", "authentication failed"))
	}

	redirectURL := h.frontendURL + "/auth/callback?access_token=" + pair.AccessToken + "&refresh_token=" + pair.RefreshToken
	return c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}
