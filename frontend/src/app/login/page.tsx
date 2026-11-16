import type { Metadata } from 'next';
import AuthModule from '@/modules/auth/AuthModule';

export const metadata: Metadata = {
  title: 'Log in - Lab-Ninja',
  description: 'Log in to Lab-Ninja.',
};

// A screen of its own, without the app header: the app is login-only, so a guest has nowhere else to go.
export default function LoginPage() {
  return <AuthModule />;
}
