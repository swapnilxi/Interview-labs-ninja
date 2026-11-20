import type { Metadata } from 'next';
import PendingApprovalModule from '@/modules/auth/PendingApprovalModule';

export const metadata: Metadata = {
  title: 'Pending approval - Lab-Ninja',
  description: 'Your account is awaiting admin approval.',
};

export default function PendingApprovalPage() {
  return <PendingApprovalModule />;
}
