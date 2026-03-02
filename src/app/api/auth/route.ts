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
 * Security fix: this route no longer creates a custom `user_id` cookie.
 * It only binds WeChat identity to an already authenticated Supabase user.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=wechat_no_code', origin));
  }

  const storedState = request.cookies.get('wechat_oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL('/login?error=wechat_invalid_state', origin));
  }

  try {
    const config = getWeChatConfig(origin);
    const tokenData = await exchangeCodeForToken(config, code);
    const tokenError = validateTokenResponse(tokenData);
    if (tokenError) {
      return NextResponse.redirect(new URL('/login?error=wechat_token_failed', origin));
    }

    const userInfo = await fetchWeChatUserInfo(tokenData.access_token, tokenData.openid);
    const userInfoError = validateUserInfoResponse(userInfo);
    if (userInfoError) {
      return NextResponse.redirect(new URL('/login?error=wechat_userinfo_failed', origin));
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // WeChat now acts as account binding, not standalone login.
    if (!user) {
      const response = NextResponse.redirect(
        new URL('/login?error=wechat_bind_requires_login', origin),
      );
      response.cookies.delete('wechat_oauth_state');
      return response;
    }

    const wechatId = userInfo.unionid ?? userInfo.openid;
    const { error: updateError } = await supabase
      .from('users')
      .update({
        wechat_id: wechatId,
        nickname: userInfo.nickname || undefined,
        avatar: userInfo.headimgurl || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      const conflict =
        updateError.code === '23505' ? 'wechat_already_bound' : 'wechat_bind_failed';
      return NextResponse.redirect(new URL(`/profile/settings?error=${conflict}`, origin));
    }

    const response = NextResponse.redirect(
      new URL('/profile/settings?wechat=linked', origin),
    );
    response.cookies.delete('wechat_oauth_state');
    return response;
  } catch (error) {
    console.error('WeChat OAuth callback error:', error);
    return NextResponse.redirect(new URL('/login?error=wechat_server_error', origin));
  }
}

