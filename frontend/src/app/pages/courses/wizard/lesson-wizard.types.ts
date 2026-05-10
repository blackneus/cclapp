import { QuizDraft } from '../../../core/utils/quiz-draft';

export type StepId = 1 | 2 | 3 | 4;

export interface PendingPdf {
  drive_file_id: string;
  name: string;
  mime_type: string;
}

export interface VideoRef {
  ref: string;
  name: string;
}

export interface WizardDraft {
  video: VideoRef | null;
  pdfs: PendingPdf[];
  title: string;
  description: string;
  moduleId: string | null;
  newModuleTitle: string;
  quizEnabled: boolean;
  quizDraft: QuizDraft;
}

export interface PartialError {
  step: 'attachment' | 'quiz' | 'module' | 'lesson';
  message: string;
}
