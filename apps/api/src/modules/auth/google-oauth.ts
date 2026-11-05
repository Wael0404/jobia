import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { Config } from "../../config";

/**
 * Scopes requested at sign-in.
 *  - gmail.send     → the agent sends applications from the user's own mailbox
 *  - gmail.readonly → the agent detects interview invitations / rejections
 * Both are "restricted" scopes: production use requires Google's OAuth app
 * verification + annual CASA security assessment (see docs/COMPLIANCE.md).
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  refreshToken: string | null;
  grantedScopes: string[];
}

export class GoogleOAuth {
  private readonly callbackUrl: string;

  constructor(private readonly config: Config) {
    this.callbackUrl = `${config.PUBLIC_API_URL}/v1/auth/google/callback`;
  }

  private client(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.config.GOOGLE_CLIENT_ID,
      clientSecret: this.config.GOOGLE_CLIENT_SECRET,
      redirectUri: this.callbackUrl,
    });
  }

  async authorizationUrl(state: string): Promise<{ url: string; codeVerifier: string }> {
    const client = this.client();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    return { url, codeVerifier };
  }

  async exchange(code: string, codeVerifier: string): Promise<GoogleIdentity> {
    const client = this.client();
    const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: this.callbackUrl });
    if (!tokens.id_token) throw new Error("Google did not return an id_token");

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new Error("Unverified Google account");

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email,
      picture: payload.picture ?? null,
      refreshToken: tokens.refresh_token ?? null,
      grantedScopes: (tokens.scope ?? "").split(" ").filter(Boolean),
    };
  }
}
