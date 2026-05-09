package storage

import (
	"context"
	"fmt"
	"os"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

type DriveClient struct {
	svc      *drive.Service
	folderID string
}

func NewDriveClient(ctx context.Context, keyPath, folderID string) (*DriveClient, error) {
	data, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("storage: read SA key: %w", err)
	}
	creds, err := google.CredentialsFromJSON(ctx, data, drive.DriveScope)
	if err != nil {
		return nil, fmt.Errorf("storage: parse SA key: %w", err)
	}
	svc, err := drive.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return nil, fmt.Errorf("storage: drive service: %w", err)
	}
	return &DriveClient{svc: svc, folderID: folderID}, nil
}

// Upload sends localPath to Drive and makes it publicly readable.
// Returns the Drive file ID.
func (d *DriveClient) Upload(ctx context.Context, localPath, name, mimeType string) (string, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return "", fmt.Errorf("storage: open file: %w", err)
	}
	defer f.Close()

	meta := &drive.File{
		Name:    name,
		Parents: []string{d.folderID},
	}
	created, err := d.svc.Files.Create(meta).
		Media(f).
		Fields("id").
		Context(ctx).
		Do()
	if err != nil {
		return "", fmt.Errorf("storage: drive upload: %w", err)
	}

	// Make publicly readable so embed iframes work without auth
	_, err = d.svc.Permissions.Create(created.Id, &drive.Permission{
		Type: "anyone",
		Role: "reader",
	}).Context(ctx).Do()
	if err != nil {
		return "", fmt.Errorf("storage: drive permission: %w", err)
	}

	return created.Id, nil
}
