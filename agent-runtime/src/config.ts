export interface PiRuntimeConfig {
  host: string;
  port: number;
  providerId: string;
  providerBaseUrl: string;
  providerApiKey: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  maxConcurrency: number;
  modelCatalogTtlMs: number;
  modelCatalogRefreshTimeoutMs: number;
  sessionTtlMs: number;
  maxActiveSessions: number;
  workDir: string;
}

function required(environ: NodeJS.ProcessEnv, name: string): string {
  const value = environ[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function integer(environ: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = environ[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function decimal(environ: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = environ[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${name} must be a number between 0 and 2.`);
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.replace(/\/+$/, '');
  if (!normalized.endsWith('/v1')) {
    throw new Error('PI_PROVIDER_BASE_URL must end with /v1.');
  }
  return normalized;
}

export function loadConfig(environ: NodeJS.ProcessEnv = process.env): PiRuntimeConfig {
  return {
    host: environ.PI_RUNTIME_HOST?.trim() || '127.0.0.1',
    port: integer(environ, 'PI_RUNTIME_PORT', 8001),
    providerId: environ.PI_PROVIDER_ID?.trim() || 'oneshare-upstream',
    providerBaseUrl: normalizeBaseUrl(required(environ, 'PI_PROVIDER_BASE_URL')),
    providerApiKey: required(environ, 'PI_PROVIDER_API_KEY'),
    defaultModel: required(environ, 'PI_DEFAULT_MODEL'),
    temperature: decimal(environ, 'PI_TEMPERATURE', 0.6),
    maxTokens: integer(environ, 'PI_MAX_TOKENS', 0),
    requestTimeoutMs: integer(environ, 'PI_REQUEST_TIMEOUT_MS', 300_000),
    maxRetries: integer(environ, 'PI_MAX_RETRIES', 1),
    maxConcurrency: integer(environ, 'PI_MAX_CONCURRENCY', 8),
    modelCatalogTtlMs: integer(environ, 'PI_MODEL_CATALOG_TTL_MS', 300_000),
    modelCatalogRefreshTimeoutMs: integer(environ, 'PI_MODEL_CATALOG_REFRESH_TIMEOUT_MS', 10_000),
    sessionTtlMs: integer(environ, 'PI_SESSION_TTL_MS', 1_800_000),
    maxActiveSessions: integer(environ, 'PI_MAX_ACTIVE_SESSIONS', 32),
    workDir: environ.PI_RUNTIME_WORK_DIR?.trim() || process.cwd(),
  };
}
