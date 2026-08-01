import type { PiRuntimeConfig } from './config.js';

export interface CatalogModel {
  id: string;
  name: string;
}

export interface ModelCatalogSnapshot {
  models: readonly CatalogModel[];
  defaultModel: string;
  version: number;
  refreshedAt: string;
  stale: boolean;
}

export class ModelCatalogUnavailableError extends Error {
  public constructor(message = 'The upstream model catalog is unavailable.') {
    super(message);
  }
}

interface OpenAIModelsResponse {
  data?: Array<{ id?: unknown; name?: unknown }>;
}

export interface ModelCatalogOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

export class ModelCatalog {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private snapshot?: ModelCatalogSnapshot;
  private refreshPromise?: Promise<ModelCatalogSnapshot>;

  public constructor(
    private readonly config: PiRuntimeConfig,
    options: ModelCatalogOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  public async start(): Promise<void> {
    await this.refresh();
  }

  public getSnapshot(): ModelCatalogSnapshot {
    if (!this.snapshot) {
      throw new ModelCatalogUnavailableError();
    }
    return this.snapshot;
  }

  public refreshIfStale(): void {
    if (!this.snapshot || this.isStale(this.snapshot)) {
      void this.refresh().catch(() => undefined);
    }
  }

  public refresh(): Promise<ModelCatalogSnapshot> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchCatalog().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }

  private isStale(snapshot: ModelCatalogSnapshot): boolean {
    return this.now().getTime() - Date.parse(snapshot.refreshedAt) > this.config.modelCatalogTtlMs;
  }

  private async fetchCatalog(): Promise<ModelCatalogSnapshot> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.config.modelCatalogRefreshTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.providerBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.providerApiKey}` },
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new ModelCatalogUnavailableError(`Model catalog request failed with HTTP ${response.status}.`);
      }
      const payload = await response.json() as OpenAIModelsResponse;
      const models = normalizeModels(payload);
      if (models.length === 0) {
        throw new ModelCatalogUnavailableError('The upstream model catalog is empty.');
      }
      if (!models.some((model) => model.id === this.config.defaultModel)) {
        throw new ModelCatalogUnavailableError('PI_DEFAULT_MODEL is absent from the upstream model catalog.');
      }
      const snapshot: ModelCatalogSnapshot = {
        models,
        defaultModel: this.config.defaultModel,
        version: (this.snapshot?.version ?? 0) + 1,
        refreshedAt: this.now().toISOString(),
        stale: false,
      };
      this.snapshot = snapshot;
      return snapshot;
    } catch (error) {
      if (this.snapshot) {
        this.snapshot = { ...this.snapshot, stale: true };
      }
      if (error instanceof ModelCatalogUnavailableError) {
        throw error;
      }
      throw new ModelCatalogUnavailableError(error instanceof Error ? error.message : undefined);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeModels(payload: OpenAIModelsResponse): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const item of payload.data ?? []) {
    if (typeof item.id !== 'string' || !item.id.trim()) {
      continue;
    }
    const id = item.id.trim();
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
    byId.set(id, { id, name });
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
