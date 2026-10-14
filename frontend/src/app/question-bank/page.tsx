import { redirect } from 'next/navigation';

export default function QuestionBankPage() {
  redirect('/daily-session?tab=question-bank');
}