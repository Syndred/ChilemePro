import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  exchangeCodeForToken,
  fetchWeChatUserInfo,
  validateTokenResponse,
  validateUserInfoResponse,
  getWeChatConfig,
} from '@/lib/services/wechat-oauth';

/**
 * GET /api/auth
 *
 * WeChat OAuth callback handler.
 * WeChat redirects here with ?code=xxx&state=xxx after user authorization.
 *
 * Flow:
 * 1. Extract code from query params
 * 2. Exchange code for access_token + openid
 * 3. Fetch user info from WeChat
 * 4. Create or find user in database
 * 5. Redirect to app (onboarding for new users, home for existing)
 *
 * Requirement 1.3: WeChat OAuth authentication
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  // Validate required params
  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=wechat_no_code', origin)
    );
  }

  // Validate state to prevent CSRF (state was stored in cookie during redirect)
  const storedState = request.cookies.get('wechat_oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.redirect(
      new URL('/login?error=wechat_invalid_state', origin)
    );
  }

  try {
    const config = getWeChatConfig(origin);

    // Step 1: Exchange code for token
    const tokenData = await exchangeCodeForToken(config, code);
    const tokenError = validateTokenResponse(tokenData);
    if (tokenError) {
      console.error('WeChat token error:', tokenError);
      return NextResponse.redirect(
        new URL('/login?error=wechat_token_failed', origin)
      );
    }

    // Step 2: Fetch user info
    const userInfo = await fetchWeChatUserInfo(
      tokenData.access_token,
      tokenData.openid
    );
    const userInfoError = validateUserInfoResponse(userInfo);
    if (userInfoError) {
      console.error('WeChat user info error:', userInfoError);
      return NextResponse.redirect(
        new URL('/login?error=wechat_userinfo_failed', origin)
      );
    }

    // Step 3: Create or find user in database
    const supabase = await createClient();
    const wechatId = userInfo.unionid ?? userInfo.openid;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('wechat_id', wechatId)
      .single();

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;

      // Update avatar/nickname if changed
      await supabase
        .from('users')
        .update({
          nickname: userInfo.nickname || undefined,
          avatar: userInfo.headimgurl || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          wechat_id: wechatId,
          nickname: userInfo.nickname || `微信用户`,
          avatar: userInfo.headimgurl || null,
          membership_tier: 'free',
        })
        .select('id')
        .single();

      if (createError || !newUser) {
        console.error('Failed to create user:', createError);
        return NextResponse.redirect(
          new URL('/login?error=wechat_create_failed', origin)
        );
      }

      userId = newUser.id;
      isNewUser = true;
    }

    // Step 4: Redirect to appropriate page
    const redirectPath = isNewUser ? '/onboarding' : '/';
    const response = NextResponse.redirect(new URL(redirectPath, origin));

    // Clear the OAuth state cookie
    response.cookies.delete('wechat_oauth_state');

    // Set a session cookie with user ID (in production, use proper session management)
    response.cookies.set('user_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('WeChat OAuth error:', error);
    return NextResponse.redirect(
      new URL('/login?error=wechat_server_error', origin)
    );
  }
}
