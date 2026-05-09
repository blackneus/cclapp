package modules

import "time"

type Module struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"-"`
	CourseID    string    `json:"course_id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	OrderIndex  int       `json:"order_index"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateModuleInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type UpdateModuleInput struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
}

type ReorderInput struct {
	Order []string `json:"order"`
}
