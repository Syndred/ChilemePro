import { describe, it, expect } from 'vitest';
import {
  buildAuthorizationUrl,
  buildTokenUrl,
  buildUserInfoUrl,
  validateTokenResponse,
  validateUserInfoResponse,
  type WeChatTokenResponse,
  type WeChatUserInfo,
} from './wechat-oauth';

describe('wechat-oauth', () => {
  const config = {
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
    redirectUri: 'https://example.com/api/auth',
  };

  describe('buildAuthorizationUrl', () => {
    it('should build a valid WeChat authorization URL', () => {
      const url = buildAuthorizationUrl(config, 'test-state');

      expect(url).toContain('https://open.weixin.qq.com/connect/oauth2/authorize');
      expect(url).toContain('appid=test-app-id');
      expect(url).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=snsapi_userinfo');
      expect(url).toContain('state=test-state');
      expect(url).toContain('#wechat_redirect');
    });
  });

  describe('buildTokenUrl', () => {
    it('should build a valid token exchange URL', () => {
      const url = buildTokenUrl(config, 'auth-code-123');

      expect(url).toContain('https://api.weixin.qq.com/sns/oauth2/access_token');
      expect(url).toContain('appid=test-app-id');
      expect(url).toContain('secret=test-app-secret');
      expect(url).toContain('code=auth-code-123');
      expect(url).toContain('grant_type=authorization_code');
    });
  });

  describe('buildUserInfoUrl', () => {
    it('should build a valid user info URL', () => {
      const url = buildUserInfoUrl('token-abc', 'openid-xyz');

      expect(url).toContain('https://api.weixin.qq.com/sns/userinfo');
      expect(url).toContain('access_token=token-abc');
      expect(url).toContain('openid=openid-xyz');
      expect(url).toContain('lang=zh_CN');
    });
  });

  describe('validateTokenResponse', () => {
    it('should return null for a valid token response', () => {
      const data: WeChatTokenResponse = {
        access_token: 'valid-token',
        expires_in: 7200,
        refresh_token: 'refresh-token',
        openid: 'openid-123',
        scope: 'snsapi_userinfo',
      };
      expect(validateTokenResponse(data)).toBeNull();
    });

    it('should return error for response with errcode', () => {
      const data: WeChatTokenResponse = {
        access_token: '',
        expires_in: 0,
        refresh_token: '',
        openid: '',
        scope: '',
        errcode: 40029,
        errmsg: 'invalid code',
      };
      expect(validateTokenResponse(data)).toBe('invalid code');
    });

    it('should return error for response with errcode but no errmsg', () => {
      const data: WeChatTokenResponse = {
        access_token: '',
        expires_in: 0,
        refresh_token: '',
        openid: '',
        scope: '',
        errcode: 40029,
      };
      expect(validateTokenResponse(data)).toBe('WeChat token error: 40029');
    });

    it('should return error when access_token is missing', () => {
      const data: WeChatTokenResponse = {
        access_token: '',
        expires_in: 7200,
        refresh_token: 'refresh',
        openid: 'openid-123',
        scope: 'snsapi_userinfo',
      };
      expect(validateTokenResponse(data)).toBe(
        'Invalid token response: missing access_token or openid'
      );
    });

    it('should return error when openid is missing', () => {
      const data: WeChatTokenResponse = {
        access_token: 'valid-token',
        expires_in: 7200,
        refresh_token: 'refresh',
        openid: '',
        scope: 'snsapi_userinfo',
      };
      expect(validateTokenResponse(data)).toBe(
        'Invalid token response: missing access_token or openid'
      );
    });
  });

  describe('validateUserInfoResponse', () => {
    it('should return null for valid user info', () => {
      const data: WeChatUserInfo = {
        openid: 'openid-123',
        nickname: 'Test User',
        sex: 1,
        province: 'Beijing',
        city: 'Beijing',
        country: 'CN',
        headimgurl: 'https://example.com/avatar.jpg',
        privilege: [],
      };
      expect(validateUserInfoResponse(data)).toBeNull();
    });

    it('should return error for response with errcode', () => {
      const data: WeChatUserInfo = {
        openid: '',
        nickname: '',
        sex: 0,
        province: '',
        city: '',
        country: '',
        headimgurl: '',
        privilege: [],
        errcode: 40003,
        errmsg: 'invalid openid',
      };
      expect(validateUserInfoResponse(data)).toBe('invalid openid');
    });

    it('should return error when openid is missing', () => {
      const data: WeChatUserInfo = {
        openid: '',
        nickname: 'Test',
        sex: 0,
        province: '',
        city: '',
        country: '',
        headimgurl: '',
        privilege: [],
      };
      expect(validateUserInfoResponse(data)).toBe(
        'Invalid user info response: missing openid'
      );
    });
  });
});
