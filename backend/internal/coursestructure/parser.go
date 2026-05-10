package coursestructure

import (
	"bufio"
	"regexp"
	"strings"

	"github.com/neusco/ccl-licreamo/backend/internal/quizzes"
)

type ParsedLesson struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type ParsedModule struct {
	Title   string         `json:"title"`
	Lessons []ParsedLesson `json:"lessons"`
}

type ParsedQuiz struct {
	PassScore int                       `json:"pass_score"`
	Questions []quizzes.ParsedQuestion  `json:"questions"`
}

type ParsedStructure struct {
	Modules []ParsedModule `json:"modules"`
	Quiz    *ParsedQuiz    `json:"quiz,omitempty"`
}

var (
	reModule    = regexp.MustCompile(`(?i)^#\s*M[OÓ]DULO\s*:\s*(.+)$`)
	reLesson    = regexp.MustCompile(`(?i)^##\s*CLASE\s*:\s*(.+)$`)
	reDesc      = regexp.MustCompile(`(?i)^Descripci[oó]n\s*:\s*(.*)$`)
	reQuizMark  = regexp.MustCompile(`(?i)^#\s*QUIZ\s+FINAL`)
	rePassScore = regexp.MustCompile(`(?i)^Puntuaci[oó]n\s+m[ií]nima\s*:\s*(\d+)`)
)

// Parse takes plain text content and produces the structured layout.
// Lines after a `Descripción:` and before the next CLASE/MÓDULO/QUIZ are appended to that lesson's description.
func Parse(content string) ParsedStructure {
	var out ParsedStructure
	var curMod *ParsedModule
	var curLesson *ParsedLesson
	var inQuiz bool
	var quizText strings.Builder

	flushLesson := func() {
		if curMod != nil && curLesson != nil {
			curMod.Lessons = append(curMod.Lessons, *curLesson)
		}
		curLesson = nil
	}
	flushModule := func() {
		flushLesson()
		if curMod != nil {
			out.Modules = append(out.Modules, *curMod)
		}
		curMod = nil
	}

	scanner := bufio.NewScanner(strings.NewReader(content))
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), " \t\r")

		if reQuizMark.MatchString(line) {
			flushModule()
			inQuiz = true
			out.Quiz = &ParsedQuiz{PassScore: 70}
			continue
		}

		if inQuiz {
			if m := rePassScore.FindStringSubmatch(line); m != nil {
				if score := parseInt(m[1]); score > 0 && score <= 100 {
					out.Quiz.PassScore = score
				}
				continue
			}
			quizText.WriteString(line)
			quizText.WriteByte('\n')
			continue
		}

		if m := reModule.FindStringSubmatch(line); m != nil {
			flushModule()
			curMod = &ParsedModule{Title: strings.TrimSpace(m[1])}
			continue
		}
		if m := reLesson.FindStringSubmatch(line); m != nil {
			flushLesson()
			if curMod == nil {
				curMod = &ParsedModule{Title: "Módulo 1"}
			}
			curLesson = &ParsedLesson{Title: strings.TrimSpace(m[1])}
			continue
		}
		if curLesson != nil {
			if m := reDesc.FindStringSubmatch(line); m != nil {
				curLesson.Description = strings.TrimSpace(m[1])
				continue
			}
			// continuación de descripción: agregar si no es vacío y ya hay desc
			if strings.TrimSpace(line) != "" && curLesson.Description != "" {
				curLesson.Description += " " + strings.TrimSpace(line)
			}
		}
	}
	if !inQuiz {
		flushModule()
	} else {
		flushModule()
		// parsea las preguntas con el parser de quizzes
		out.Quiz.Questions = quizzes.ParseQuiz(quizText.String())
	}
	return out
}

func parseInt(s string) int {
	n := 0
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			break
		}
		n = n*10 + int(ch-'0')
	}
	return n
}
