import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword, createAccessToken } from '@/lib/server/authHelper';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email || !password) {
      return NextResponse.json({ detail: 'Email and password are required' }, { status: 400 });
    }

    const user = findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ detail: 'Incorrect email or password' }, { status: 401 });
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
    console.error('Error in POST /api/auth/login:', err);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
}
