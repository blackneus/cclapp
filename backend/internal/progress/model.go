package progress

import "time"

type LessonProgress struct {
	LessonID    string    `json:"lesson_id"`
	CompletedAt time.Time `json:"completed_at"`
}
