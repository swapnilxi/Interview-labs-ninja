/**
 * fe-apis/auth/signup.ts
 *
 * Business logic for POST /api/auth/signup.
 * Creates a new user account (email uniqueness check, bcrypt hash, JWT).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  findUserByEmail,
  createUser,
  hashPassword,
  createAccessToken,
} from '../_shared/db';

export async function handleSignup(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { email, password, display_name } = body || {};

    if (!email || !password) {
      return NextResponse.json(
        { detail: 'Email and password are required' },
        { status: 400 }
      );
    }

    const existing = findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { detail: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    const pwdHash = hashPassword(password);
    const user = createUser(email, pwdHash, display_name);

    if (!user) {
      return NextResponse.json(
        { detail: 'Failed to create user account' },
        { status: 500 }
      );
    }

    const token = createAccessToken(user.id, user.email);

    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[fe-api/auth/signup] Unexpected error:', err);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
