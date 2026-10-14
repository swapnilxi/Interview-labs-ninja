import { redirect } from 'next/navigation';

export default function ProgressDashboardPage() {
  redirect('/daily-session?tab=progress');
}