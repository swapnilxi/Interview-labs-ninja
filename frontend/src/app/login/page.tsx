import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import AuthModule from '@/modules/auth/AuthModule';

export const metadata: Metadata = {
  title: 'Log in - Lab-Ninja',
  description: 'Log in to sync your tasks and unlock AI features across devices.',
};

export default function LoginPage() {
  return (
    <>
      <Header />
      <AuthModule />
    </>
  );
}
