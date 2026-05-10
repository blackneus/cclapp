package courses

import "time"

type Course struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"-"`
	TeacherID     string    `json:"teacher_id"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	CoverImageURL string    `json:"cover_image_url"`
	Price         string    `json:"price"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CreateCourseInput struct {
	TeacherID   string `json:"teacher_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Price       string `json:"price"`
}

type UpdateCourseInput struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Price       *string `json:"price"`
	Status      *string `json:"status"`
	TeacherID   *string `json:"teacher_id"`
}
