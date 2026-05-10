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

// CreateFolder creates a folder in the configured shared drive (or under parentID if given).
func (d *DriveClient) CreateFolder(ctx context.Context, name, parentID string) (string, error) {
	if parentID == "" {
		parentID = d.folderID
	}
	folder, err := d.svc.Files.Create(&drive.File{
		Name:     name,
		MimeType: "application/vnd.google-apps.folder",
		Parents:  []string{parentID},
	}).Fields("id").SupportsAllDrives(true).Context(ctx).Do()
	if err != nil {
		return "", fmt.Errorf("storage: create folder: %w", err)
	}
	return folder.Id, nil
}

// Upload sends localPath to Drive and makes it publicly readable.
// Returns the Drive file ID.
func (d *DriveClient) Upload(ctx context.Context, localPath, name, mimeType string) (string, error) {
	return d.UploadTo(ctx, localPath, name, mimeType, "")
}

// UploadTo allows specifying a parent folder ID; falls back to root shared-drive folder if empty.
func (d *DriveClient) UploadTo(ctx context.Context, localPath, name, mimeType, parentID string) (string, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return "", fmt.Errorf("storage: open file: %w", err)
	}
	defer f.Close()

	if parentID == "" {
		parentID = d.folderID
	}
	meta := &drive.File{
		Name:    name,
		Parents: []string{parentID},
	}
	created, err := d.svc.Files.Create(meta).
		Media(f).
		Fields("id").
		SupportsAllDrives(true).
		Context(ctx).
		Do()
	if err != nil {
		return "", fmt.Errorf("storage: drive upload: %w", err)
	}

	// Make publicly readable so embed iframes work without auth
	_, err = d.svc.Permissions.Create(created.Id, &drive.Permission{
		Type: "anyone",
		Role: "reader",
	}).SupportsAllDrives(true).Context(ctx).Do()
	if err != nil {
		return "", fmt.Errorf("storage: drive permission: %w", err)
	}

	return created.Id, nil
}

// Inspect returns metadata + permissions for a file (debug/diagnostics).
func (d *DriveClient) Inspect(ctx context.Context, fileID string) (map[string]interface{}, error) {
	f, err := d.svc.Files.Get(fileID).
		Fields("id, name, mimeType, driveId, parents, webViewLink, capabilities, permissionIds, shared").
		SupportsAllDrives(true).
		Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("storage: inspect get: %w", err)
	}
	perms, err := d.svc.Permissions.List(fileID).
		Fields("permissions(id, type, role, emailAddress, allowFileDiscovery, displayName)").
		SupportsAllDrives(true).
		Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("storage: inspect perms: %w", err)
	}
	return map[string]interface{}{
		"file":        f,
		"permissions": perms.Permissions,
	}, nil
}

// MakePublic grants anyone:reader permission to an existing Drive file.
// Used when a file was selected via Drive Picker (already in Drive but not yet public).
func (d *DriveClient) MakePublic(ctx context.Context, fileID string) error {
	_, err := d.svc.Permissions.Create(fileID, &drive.Permission{
		Type: "anyone",
		Role: "reader",
	}).SupportsAllDrives(true).Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("storage: make public: %w", err)
	}
	return nil
}
