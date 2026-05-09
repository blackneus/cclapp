package lessons

import "time"

type Attachment struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	DriveFileID string    `json:"drive_file_id"`
	MimeType    string    `json:"mime_type"`
	OrderIndex  int       `json:"order_index"`
	CreatedAt   time.Time `json:"created_at"`
}

type Lesson struct {
	ID                   string       `json:"id"`
	TenantID             string       `json:"-"`
	ModuleID             string       `json:"module_id"`
	Title                string       `json:"title"`
	Description          string       `json:"description"`
	OrderIndex           int          `json:"order_index"`
	VideoStorageProvider string       `json:"video_storage_provider"`
	VideoStorageRef      string       `json:"video_storage_ref"`
	DurationSeconds      int          `json:"duration_seconds"`
	Attachments          []Attachment `json:"attachments"`
	CreatedAt            time.Time    `json:"created_at"`
	UpdatedAt            time.Time    `json:"updated_at"`
}

type CreateLessonInput struct {
	Title                string `json:"title"`
	Description          string `json:"description"`
	VideoStorageProvider string `json:"video_storage_provider"`
	VideoStorageRef      string `json:"video_storage_ref"`
	DurationSeconds      int    `json:"duration_seconds"`
}

type UpdateLessonInput struct {
	Title                *string `json:"title"`
	Description          *string `json:"description"`
	VideoStorageProvider *string `json:"video_storage_provider"`
	VideoStorageRef      *string `json:"video_storage_ref"`
	DurationSeconds      *int    `json:"duration_seconds"`
}

type AddAttachmentInput struct {
	Name        string `json:"name"`
	DriveFileID string `json:"drive_file_id"`
	MimeType    string `json:"mime_type"`
}

type ReorderInput struct {
	Order []string `json:"order"`
}
