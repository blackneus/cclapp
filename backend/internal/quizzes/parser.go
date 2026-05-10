package quizzes

import (
	"bufio"
	"regexp"
	"strings"
)

// ParsedQuestion is the import-friendly shape used by the import endpoint.
type ParsedQuestion struct {
	Text    string         `json:"text"`
	Options []ParsedOption `json:"options"`
}

type ParsedOption struct {
	Text      string `json:"text"`
	IsCorrect bool   `json:"is_correct"`
}

var (
	// "1. ", "12. " — start of a question
	reQuestion = regexp.MustCompile(`^\s*(\d+)[\.\)]\s+(.+)$`)
	// "a)", "b.", "(c)", optional leading "*" for correct
	reOption = regexp.MustCompile(`^\s*(\*?)\s*\(?([a-zA-Z])\)?[\.\)]\s+(.+)$`)
	// "V" / "F" / "Verdadero" / "Falso" with optional leading "*"
	reVF = regexp.MustCompile(`^\s*(\*?)\s*(V|F|Verdadero|Falso|VERDADERO|FALSO)\s*$`)
)

// ParseQuiz reads plain-text content and returns a list of questions.
// Format:
//   1. Pregunta?
//   a) opcion
//   *b) opcion correcta
//   c) opcion
//
//   2. Otra pregunta V/F.
//   *V
//   F
func ParseQuiz(content string) []ParsedQuestion {
	var questions []ParsedQuestion
	var current *ParsedQuestion

	flush := func() {
		if current != nil && len(current.Options) > 0 {
			// ensure at least one correct; if none, default first to true so the user can edit
			hasCorrect := false
			for _, o := range current.Options {
				if o.IsCorrect {
					hasCorrect = true
					break
				}
			}
			if !hasCorrect && len(current.Options) > 0 {
				current.Options[0].IsCorrect = true
			}
			questions = append(questions, *current)
		}
		current = nil
	}

	scanner := bufio.NewScanner(strings.NewReader(content))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), " \t\r")
		if line == "" {
			continue
		}
		if m := reQuestion.FindStringSubmatch(line); m != nil {
			flush()
			current = &ParsedQuestion{Text: strings.TrimSpace(m[2])}
			continue
		}
		if current == nil {
			continue
		}
		if m := reVF.FindStringSubmatch(line); m != nil {
			label := strings.ToUpper(m[2])
			text := "Verdadero"
			if strings.HasPrefix(label, "F") {
				text = "Falso"
			}
			current.Options = append(current.Options, ParsedOption{
				Text:      text,
				IsCorrect: m[1] == "*",
			})
			continue
		}
		if m := reOption.FindStringSubmatch(line); m != nil {
			current.Options = append(current.Options, ParsedOption{
				Text:      strings.TrimSpace(m[3]),
				IsCorrect: m[1] == "*",
			})
			continue
		}
		// continuation line: append to last option (or to question if no options yet)
		if len(current.Options) > 0 {
			last := &current.Options[len(current.Options)-1]
			last.Text += " " + strings.TrimSpace(line)
		} else {
			current.Text += " " + strings.TrimSpace(line)
		}
	}
	flush()
	return questions
}
