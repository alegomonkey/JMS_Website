import { randomBytes } from "node:crypto";
import type { OauthProvider } from "../middleware/auth.js";

export interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
}

export const PROVIDERS: Record<OauthProvider, ProviderConfig> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: "read:user",
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
};

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ProviderUser {
  providerUserId: string;
  suggestedUsername: string;
}

const USERNAME_BAD_CHAR = /[^A-Za-z0-9_-]+/g;

export function sanitizeUsername(raw: string): string {
  let s = raw.replace(USERNAME_BAD_CHAR, "");
  if (s.length > 32) s = s.slice(0, 32);
  if (s.length < 3) {
    s = (s + randomBytes(4).toString("hex")).slice(0, 8);
  }
  return s;
}

interface GithubUserResp {
  id: number | string;
  login: string;
}

interface GoogleUserResp {
  sub: string;
  email?: string;
  name?: string;
}

export async function exchangeCodeForUser(
  provider: OauthProvider,
  creds: ProviderCredentials,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderUser> {
  const cfg = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetchImpl(cfg.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(`oauth token exchange failed: ${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error("oauth token exchange returned no access_token");

  const userRes = await fetchImpl(cfg.userInfoUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "JMS-Website",
    },
  });
  if (!userRes.ok) {
    throw new Error(`oauth userinfo fetch failed: ${userRes.status}`);
  }

  if (provider === "github") {
    const u = (await userRes.json()) as GithubUserResp;
    if (u.id === undefined || u.id === null || !u.login) {
      throw new Error("oauth github userinfo missing id or login");
    }
    return {
      providerUserId: String(u.id),
      suggestedUsername: sanitizeUsername(u.login),
    };
  }

  const u = (await userRes.json()) as GoogleUserResp;
  if (!u.sub) throw new Error("oauth google userinfo missing sub");
  const seed = u.email ? u.email.split("@")[0]! : u.name ?? "";
  return {
    providerUserId: u.sub,
    suggestedUsername: sanitizeUsername(seed || u.sub),
  };
}
