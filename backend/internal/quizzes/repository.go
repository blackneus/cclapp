package quizzes

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/neusco/ccl-licreamo/backend/internal/db"
)

type Repository struct {
	db *db.DB
}

func NewRepository(database *db.DB) *Repository {
	return &Repository{db: database}
}

func (r *Repository) GetByLesson(ctx context.Context, tenantID, lessonID string) (*Quiz, error) {
	var quiz Quiz
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx,
			`SELECT id, lesson_id, pass_score, created_at FROM quizzes WHERE lesson_id = $1`,
			lessonID,
		).Scan(&quiz.ID, &quiz.LessonID, &quiz.PassScore, &quiz.CreatedAt); err != nil {
			return err
		}

		rows, err := tx.Query(ctx,
			`SELECT id, text, order_index FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_index`,
			quiz.ID,
		)
		if err != nil {
			return fmt.Errorf("questions: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var q Question
			if err := rows.Scan(&q.ID, &q.Text, &q.Order); err != nil {
				return err
			}
			quiz.Questions = append(quiz.Questions, q)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		rows.Close()

		for i, q := range quiz.Questions {
			optRows, err := tx.Query(ctx,
				`SELECT id, text, is_correct, order_index FROM quiz_options WHERE question_id = $1 ORDER BY order_index`,
				q.ID,
			)
			if err != nil {
				return fmt.Errorf("options for question %s: %w", q.ID, err)
			}
			for optRows.Next() {
				var o Option
				if err := optRows.Scan(&o.ID, &o.Text, &o.IsCorrect, &o.Order); err != nil {
					optRows.Close()
					return err
				}
				quiz.Questions[i].Options = append(quiz.Questions[i].Options, o)
			}
			optRows.Close()
			if err := optRows.Err(); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &quiz, nil
}

func (r *Repository) DeleteByLesson(ctx context.Context, tenantID, lessonID string) error {
	return r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM quizzes WHERE lesson_id = $1`, lessonID)
		return err
	})
}

func (r *Repository) Save(ctx context.Context, tenantID, lessonID string, inp SaveInput) (*Quiz, error) {
	if inp.PassScore <= 0 {
		inp.PassScore = 70
	}
	var quiz Quiz
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx,
			`INSERT INTO quizzes (tenant_id, lesson_id, pass_score)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (lesson_id) DO UPDATE SET pass_score = EXCLUDED.pass_score
			 RETURNING id, lesson_id, pass_score, created_at`,
			tenantID, lessonID, inp.PassScore,
		).Scan(&quiz.ID, &quiz.LessonID, &quiz.PassScore, &quiz.CreatedAt); err != nil {
			return fmt.Errorf("upsert quiz: %w", err)
		}

		if _, err := tx.Exec(ctx, `DELETE FROM quiz_questions WHERE quiz_id = $1`, quiz.ID); err != nil {
			return fmt.Errorf("delete questions: %w", err)
		}

		for i, qi := range inp.Questions {
			var qID string
			if err := tx.QueryRow(ctx,
				`INSERT INTO quiz_questions (tenant_id, quiz_id, text, order_index) VALUES ($1, $2, $3, $4) RETURNING id`,
				tenantID, quiz.ID, qi.Text, i,
			).Scan(&qID); err != nil {
				return fmt.Errorf("insert question: %w", err)
			}
			q := Question{ID: qID, Text: qi.Text, Order: i}
			for j, oi := range qi.Options {
				var oID string
				if err := tx.QueryRow(ctx,
					`INSERT INTO quiz_options (tenant_id, question_id, text, is_correct, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
					tenantID, qID, oi.Text, oi.IsCorrect, j,
				).Scan(&oID); err != nil {
					return fmt.Errorf("insert option: %w", err)
				}
				q.Options = append(q.Options, Option{ID: oID, Text: oi.Text, IsCorrect: oi.IsCorrect, Order: j})
			}
			quiz.Questions = append(quiz.Questions, q)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &quiz, nil
}

func (r *Repository) SubmitAttempt(ctx context.Context, tenantID, lessonID, userID string, inp AttemptInput) (*AttemptResult, error) {
	var result AttemptResult
	err := r.db.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var quizID string
		var passScore int
		if err := tx.QueryRow(ctx,
			`SELECT id, pass_score FROM quizzes WHERE lesson_id = $1`, lessonID,
		).Scan(&quizID, &passScore); err != nil {
			return fmt.Errorf("quiz not found: %w", err)
		}

		var enrollmentID *string
		var eid string
		if err := tx.QueryRow(ctx,
			`SELECT e.id FROM enrollments e
			 JOIN modules m ON m.course_id = e.course_id
			 JOIN lessons l ON l.module_id = m.id
			 WHERE e.student_id = $1 AND l.id = $2
			 LIMIT 1`,
			userID, lessonID,
		).Scan(&eid); err == nil {
			enrollmentID = &eid
		}

		for _, ans := range inp.Answers {
			var correct bool
			err := tx.QueryRow(ctx,
				`SELECT is_correct FROM quiz_options WHERE id = $1 AND question_id = $2`,
				ans.OptionID, ans.QuestionID,
			).Scan(&correct)
			if err != nil {
				continue
			}
			result.Total++
			if correct {
				result.Right++
			}
		}

		if result.Total > 0 {
			result.Score = (result.Right * 100) / result.Total
		}
		result.Passed = result.Score >= passScore

		if enrollmentID != nil {
			_, err := tx.Exec(ctx,
				`INSERT INTO quiz_attempts (tenant_id, enrollment_id, quiz_id, score, passed) VALUES ($1, $2, $3, $4, $5)`,
				tenantID, *enrollmentID, quizID, result.Score, result.Passed,
			)
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}
