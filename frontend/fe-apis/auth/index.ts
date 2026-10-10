/**
 * fe-apis/auth/index.ts
 *
 * Barrel export for the auth module — import everything from 'fe-apis/auth'.
 */

import { handleSignup as handleSignupImpl } from './signup';
import { withNeonSync } from '@/lib/server/neonSync';

export { handleLogin } from './login';
// Pushed to Neon after a successful signup creates a new user row -- see
// src/lib/server/neonSync.ts.
export const handleSignup = withNeonSync(handleSignupImpl);
export { handleMe } from './me';
export { handleLogout } from './logout';
