'use client';

import QuestionTableRow from './QuestionTableRow';

interface Question {
  id: string;
  questionText: string;
  category: 'Interview' | 'CV Skill';
  subType: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dateEncountered: string;
  lastReviewed: string | null;
  userPerformance?: number;
}

interface QuestionTableMobileProps {
  questions: Question[];
  onReview: (questionId: string) => void;
  onPractice: (questionId: string) => void;
  selectedQuestions: string[];
  onSelect: (questionId: string) => void;
}

/**
 * The list view as one grouped list (iOS inset style), at every width: the name is historical, from when phones had
 * cards and desktops a table. Each row is a QuestionTableRow, which reflows itself for narrow screens.
 */
export default function QuestionTableMobile({
  questions,
  onReview,
  onPractice,
  selectedQuestions,
  onSelect,
}: QuestionTableMobileProps) {
  return (
    <ul className="ds-list ins-qlist" aria-label="Questions">
      {questions.map((question) => (
        <QuestionTableRow
          key={question.id}
          question={question}
          onReview={onReview}
          onPractice={onPractice}
          isSelected={selectedQuestions.includes(question.id)}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
