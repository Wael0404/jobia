import type {
  ApplicationDetailDto,
  ApplicationDto,
  AuthTokens,
  BoardProvider,
  IntegrationDto,
  JobPreferences,
  ListApplicationsQuery,
  MeResponse,
  Page,
  ReportSummaryDto,
  AgentSearchStatusDto,
  BillingStatusDto,
  PlanId,
} from "@jobia/shared";

/** Where tokens are persisted: localStorage on web, SecureStore (Keychain/Keystore) on mobile. */
export interface TokenStore {
  get(): Promise<AuthTokens | null>;
  set(tokens: AuthTokens | null): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CvDto {
  id: string;
  fileName: string;
  status: "pending_upload" | "parsing" | "ready" | "failed";
  profile: { fullName: string; headline: string; skills: string[]; targetRoles: string[] } | null;
  error: string | null;
  createdAt: string;
}

/**
 * Typed client shared by the web dashboard and the mobile app.
 * Handles bearer auth and transparent, de-duplicated token refresh.
 */
export class JobiaClient {
  private refreshing: Promise<AuthTokens | null> | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly tokens: TokenStore,
    private readonly onSignedOut: () => void = () => {},
  ) {}

  /* ---------- auth ---------- */

  googleSignInUrl(redirect: string): string {
    return `${this.baseUrl}/v1/auth/google/start?redirect=${encodeURIComponent(redirect)}`;
  }

  async exchangeLoginCode(code: string): Promise<void> {
    const tokens = await this.request<AuthTokens>("POST", "/v1/auth/exchange", { code }, false);
    await this.tokens.set(tokens);
  }

  async signOut(): Promise<void> {
    const current = await this.tokens.get();
    if (current) await this.request("POST", "/v1/auth/logout", { refreshToken: current.refreshToken }, false).catch(() => {});
    await this.tokens.set(null);
  }

  /* ---------- resources ---------- */

  me = () => this.request<MeResponse>("GET", "/v1/me");
  deleteAccount = () => this.request<void>("DELETE", "/v1/me");
  preferences = () => this.request<JobPreferences>("GET", "/v1/me/preferences");
  updatePreferences = (p: JobPreferences) => this.request<JobPreferences>("PUT", "/v1/me/preferences", p);
  saveAnswers = (answers: Record<string, string>) => this.request<void>("PUT", "/v1/me/answers", { answers });

  latestCv = () => this.request<CvDto | null>("GET", "/v1/cvs/latest");

  /** Two-step upload: presigned URL → direct PUT to object storage → confirm. */
  async uploadCv(file: { name: string; type: string; size: number; body: Blob }): Promise<CvDto> {
    const { cvId, uploadUrl, headers } = await this.request<{ cvId: string; uploadUrl: string; headers: Record<string, string> }>(
      "POST",
      "/v1/cvs/uploads",
      { fileName: file.name, mimeType: file.type, sizeBytes: file.size },
    );
    const put = await fetch(uploadUrl, { method: "PUT", headers, body: file.body });
    if (!put.ok) throw new ApiError(put.status, "upload_failed", "Le téléversement du CV a échoué");
    return this.request<CvDto>("POST", "/v1/cvs/confirm", { cvId });
  }

  integrations = () => this.request<IntegrationDto[]>("GET", "/v1/integrations");
  connectBoard = (provider: BoardProvider, login: string, password: string) =>
    this.request<void>("POST", "/v1/integrations/boards", { provider, login, password, acceptedRisk: true });
  disconnect = (provider: string) => this.request<void>("DELETE", `/v1/integrations/${provider}`);

  applications(query: Partial<ListApplicationsQuery> = {}): Promise<Page<ApplicationDto>> {
    const qs = new URLSearchParams(
      Object.entries(query).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    ).toString();
    return this.request("GET", `/v1/applications${qs ? `?${qs}` : ""}`);
  }
  application = (id: string) => this.request<ApplicationDetailDto>("GET", `/v1/applications/${id}`);
  approve = (id: string) => this.request<void>("POST", `/v1/applications/${id}/approve`);
  retry = (id: string) => this.request<void>("POST", `/v1/applications/${id}/retry`);
  markApplied = (id: string) => this.request<void>("POST", `/v1/applications/${id}/mark-applied`);
  withdraw = (id: string) => this.request<void>("POST", `/v1/applications/${id}/withdraw`);

  reportSummary = () => this.request<ReportSummaryDto>("GET", "/v1/reports/summary");

  /** Background job search: start it, then poll its status (counts only). */
  searchStatus = () => this.request<AgentSearchStatusDto>("GET", "/v1/agent/search");
  startSearch = () => this.request<AgentSearchStatusDto>("POST", "/v1/agent/search");

  /** Subscription plan and today's usage. */
  billing = () => this.request<BillingStatusDto>("GET", "/v1/billing");
  choosePlan = (plan: PlanId) => this.request<BillingStatusDto>("POST", "/v1/billing/plan", { plan });

  /* ---------- transport ---------- */

  private async request<T>(method: string, path: string, body?: unknown, authenticated = true, retried = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (authenticated) {
      const tokens = await this.tokens.get();
      if (!tokens) throw this.signedOut();
      headers.authorization = `Bearer ${tokens.accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 401 && authenticated && !retried) {
      const refreshed = await this.refresh();
      if (!refreshed) throw this.signedOut();
      return this.request<T>(method, path, body, authenticated, true);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new ApiError(res.status, err.error ?? "http_error", err.message ?? res.statusText);
    }
    return (res.status === 204 || res.status === 202 ? undefined : await res.json()) as T;
  }

  /** Concurrent 401s share one refresh call (refresh tokens are single-use). */
  private refresh(): Promise<AuthTokens | null> {
    this.refreshing ??= (async () => {
      try {
        const current = await this.tokens.get();
        if (!current) return null;
        const next = await this.request<AuthTokens>("POST", "/v1/auth/refresh", { refreshToken: current.refreshToken }, false);
        await this.tokens.set(next);
        return next;
      } catch (error) {
        // Only a server refusal ends the session. A network failure (offline, flaky
        // tunnel, server restarting) keeps the tokens so the next request can retry.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
          await this.tokens.set(null);
          return null;
        }
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private signedOut(): ApiError {
    this.onSignedOut();
    return new ApiError(401, "signed_out", "Session expirée");
  }
}

export const STATUS_LABELS: Record<ApplicationDto["status"], string> = {
  pending_review: "À valider",
  queued: "En file d'attente",
  submitting: "Envoi en cours",
  submitted: "Envoyée",
  viewed: "Vue par le recruteur",
  interview: "Entretien",
  offer: "Offre reçue",
  rejected: "Refusée",
  withdrawn: "Retirée",
  user_to_apply: "À postuler vous-même",
  needs_user_action: "Action requise",
  failed: "Échec",
};
