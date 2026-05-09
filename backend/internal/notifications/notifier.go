package notifications

import (
	"context"
	"log/slog"
)

type Event struct {
	Type     string
	TenantID string
	UserID   string
	Payload  map[string]string
}

// Notifier is the interface for all notification backends.
type Notifier interface {
	Send(ctx context.Context, chatID string, event Event) error
}

// DryRunNotifier logs notifications instead of sending them. Used in dev and when Telegram is not configured.
type DryRunNotifier struct{}

func NewDryRunNotifier() *DryRunNotifier { return &DryRunNotifier{} }

func (n *DryRunNotifier) Send(ctx context.Context, chatID string, event Event) error {
	slog.InfoContext(ctx, "notification (dry-run)",
		"chat_id", chatID,
		"event_type", event.Type,
		"tenant_id", event.TenantID,
		"user_id", event.UserID,
	)
	return nil
}
