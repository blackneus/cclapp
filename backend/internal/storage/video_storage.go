package storage

import (
	"context"
	"io"
	"net/http"
)

type UploadMetadata struct {
	Filename    string
	ContentType string
	TenantID    string
}

// VideoStorage is the interface for all video storage backends.
// V1 implementation is DriveStorage (stub). Future: NASStorage, S3Storage.
type VideoStorage interface {
	StreamVideo(ctx context.Context, ref, rangeHeader string) (io.ReadCloser, http.Header, error)
	UploadVideo(ctx context.Context, reader io.Reader, meta UploadMetadata) (ref string, err error)
	DeleteVideo(ctx context.Context, ref string) error
	HealthCheck(ctx context.Context) error
}

// DriveStorage is a stub implementation. Replace with real Google Drive client in v2.
type DriveStorage struct{}

func NewDriveStorage() *DriveStorage { return &DriveStorage{} }

func (d *DriveStorage) StreamVideo(_ context.Context, _, _ string) (io.ReadCloser, http.Header, error) {
	return nil, nil, newNotImplementedError("video streaming not implemented in v1")
}

func (d *DriveStorage) UploadVideo(_ context.Context, _ io.Reader, _ UploadMetadata) (string, error) {
	return "", newNotImplementedError("video upload not implemented in v1")
}

func (d *DriveStorage) DeleteVideo(_ context.Context, _ string) error {
	return newNotImplementedError("video delete not implemented in v1")
}

func (d *DriveStorage) HealthCheck(_ context.Context) error { return nil }

type notImplementedError struct{ msg string }

func (e *notImplementedError) Error() string { return e.msg }

func newNotImplementedError(msg string) error { return &notImplementedError{msg: msg} }
