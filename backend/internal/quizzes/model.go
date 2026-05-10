package quizzes

import "time"

type Option struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	IsCorrect bool   `json:"is_correct,omitempty"`
	Order     int    `json:"order_index"`
}

type Question struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Order   int      `json:"order_index"`
	Options []Option `json:"options"`
}

type Quiz struct {
	ID        string     `json:"id"`
	LessonID  string     `json:"lesson_id"`
	PassScore int        `json:"pass_score"`
	Questions []Question `json:"questions"`
	CreatedAt time.Time  `json:"created_at"`
}

type SaveInput struct {
	PassScore int             `json:"pass_score"`
	Questions []QuestionInput `json:"questions"`
}

type QuestionInput struct {
	Text    string        `json:"text"`
	Options []OptionInput `json:"options"`
}

type OptionInput struct {
	Text      string `json:"text"`
	IsCorrect bool   `json:"is_correct"`
}

type AnswerInput struct {
	QuestionID string `json:"question_id"`
	OptionID   string `json:"option_id"`
}

type AttemptInput struct {
	Answers []AnswerInput `json:"answers"`
}

type AttemptResult struct {
	Score  int  `json:"score"`
	Passed bool `json:"passed"`
	Total  int  `json:"total"`
	Right  int  `json:"right"`
}
