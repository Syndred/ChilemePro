/**
 * WeChat OAuth service - core logic for WeChat authentication flow.
 *
 * WeChat OAuth 2.0 flow:
 * 1. Redirect user to WeChat authorization URL
 * 2. User authorizes, WeChat redirects back with a `code`
 * 3. Exchange `code` for access_token + openid
 * 4. Use access_token to fetch user info
 *
 * Requirement 1.3: WeChat OAuth authentication
 */

// --- Types ---

export interface WeChatOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface WeChatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export interface WeChatUserInfo {
  openid: string;
  nickname: string;
  sex: number; // 1=male, 2=female, 0=unknown
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

// --- Pure functions ---

/**
 * Build the WeChat OAuth authorization URL.
 * Users are redirected here to grant permission.
 */
export function buildAuthorizationUrl(
  config: Pick<WeChatOAuthConfig, 'appId' | 'redirectUri'>,
  state: string
): string {
  const params = new URLSearchParams({
    appid: config.appId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'snsapi_userinfo',
    state,
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
}

/**
 * Build the URL to exchange an authorization code for an access token.
 */
export function buildTokenUrl(
  config: Pick<WeChatOAuthConfig, 'appId' | 'appSecret'>,
  code: string
): string {
  const params = new URLSearchParams({
    appid: config.appId,
    secret: config.appSecret,
    code,
    grant_type: 'authorization_code',
  });
  return `https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`;
}

/**
 * Build the URL to fetch user info with an access token.
 */
export function buildUserInfoUrl(accessToken: string, openid: string): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    openid,
    lang: 'zh_CN',
  });
  return `https://api.weixin.qq.com/sns/userinfo?${params.toString()}`;
}

/**
 * Validate a WeChat token response. Returns an error string if invalid.
 */
export function validateTokenResponse(
  data: WeChatTokenResponse
): string | null {
  if (data.errcode) {
    return data.errmsg ?? `WeChat token error: ${data.errcode}`;
  }
  if (!data.access_token || !data.openid) {
    return 'Invalid token response: missing access_token or openid';
  }
  return null;
}

/**
 * Validate a WeChat user info response. Returns an error string if invalid.
 */
export function validateUserInfoResponse(
  data: WeChatUserInfo
): string | null {
  if (data.errcode) {
    return data.errmsg ?? `WeChat user info error: ${data.errcode}`;
  }
  if (!data.openid) {
    return 'Invalid user info response: missing openid';
  }
  return null;
}

// --- Side-effectful functions ---

/**
 * Exchange authorization code for access token by calling WeChat API.
 */
export async function exchangeCodeForToken(
  config: Pick<WeChatOAuthConfig, 'appId' | 'appSecret'>,
  code: string
): Promise<WeChatTokenResponse> {
  const url = buildTokenUrl(config, code);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WeChat token request failed: ${response.status}`);
  }
  return response.json() as Promise<WeChatTokenResponse>;
}

/**
 * Fetch WeChat user info using access token.
 */
export async function fetchWeChatUserInfo(
  accessToken: string,
  openid: string
): Promise<WeChatUserInfo> {
  const url = buildUserInfoUrl(accessToken, openid);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WeChat user info request failed: ${response.status}`);
  }
  return response.json() as Promise<WeChatUserInfo>;
}

/**
 * Get WeChat OAuth config from environment variables.
 * Throws if required env vars are missing.
 */
export function getWeChatConfig(baseUrl: string): WeChatOAuthConfig {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Missing WECHAT_APP_ID or WECHAT_APP_SECRET environment variables'
    );
  }

  return {
    appId,
    appSecret,
    redirectUri: `${baseUrl}/api/auth`,
  };
}
