// Thin HTTP client for the servicio_back REST API. The MCP server never talks
// to the database: every call goes through the API, so RBAC (RN-06, RN-07),
// validation and the transition pipeline (RN-04) still apply to the agent.

export interface TallerApiConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
}

export class TallerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TallerApiError';
  }
}

export interface TallerApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

type Fetch = typeof fetch;

export class HttpTallerApi implements TallerApi {
  private accessToken: string | undefined;

  constructor(
    private readonly config: TallerApiConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const token = await this.token();
    const response = await this.send(method, path, body, token);
    // Access tokens live 15 min (BE-E14): log in again once, then give up.
    if (response.status === 401 && !retried) {
      this.accessToken = undefined;
      return this.request<T>(method, path, body, true);
    }
    return this.parse<T>(response);
  }

  private async token(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const response = await this.send('POST', '/auth/login', { username: this.config.username, password: this.config.password });
    const session = await this.parse<{ accessToken: string }>(response);
    this.accessToken = session.accessToken;
    return session.accessToken;
  }

  private async send(method: string, path: string, body: unknown, token?: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new TallerApiError(503, `No se pudo contactar la API (${this.config.baseUrl}): ${reason}`);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const payload: unknown = text ? safeJson(text) : undefined;
    if (!response.ok) {
      const { message, code } = errorFields(payload);
      throw new TallerApiError(response.status, message ?? `HTTP ${response.status}`, code);
    }
    return payload as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// AllExceptionsFilter body: { statusCode, message, error, code?, ... } (BE-26).
function errorFields(payload: unknown): { message?: string; code?: string } {
  if (typeof payload !== 'object' || payload === null) return { message: typeof payload === 'string' ? payload : undefined };
  const record = payload as Record<string, unknown>;
  const message = Array.isArray(record.message) ? record.message.join('; ') : typeof record.message === 'string' ? record.message : undefined;
  return { message, code: typeof record.code === 'string' ? record.code : undefined };
}
