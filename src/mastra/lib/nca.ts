import { env } from '../../lib/env';

export class NcaError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    public path: string,
    message: string,
  ) {
    super(message);
    this.name = 'NcaError';
  }
}

export interface NcaRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  timeoutMs?: number;
  retries?: number;
}

export async function ncaRequest<T>(
  path: string,
  body?: unknown,
  opts: NcaRequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/')) {
    throw new Error(`NCA path must start with '/': ${path}`);
  }

  const method = opts.method ?? (body !== undefined ? 'POST' : 'GET');
  const timeoutMs = opts.timeoutMs ?? env.NCA_TIMEOUT_MS;
  const retries = opts.retries ?? env.NCA_RETRIES;
  const url = `${env.NCA_BASE_URL}${path}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'x-api-key': env.NCA_API_KEY,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status >= 400 && response.status < 500) {
        const errBody = await safeJson(response);
        throw new NcaError(
          response.status,
          errBody,
          path,
          `NCA request failed with ${response.status}: ${JSON.stringify(errBody)}`,
        );
      }

      if (response.status >= 500) {
        const errBody = await safeJson(response);
        lastError = new NcaError(
          response.status,
          errBody,
          path,
          `NCA request failed with ${response.status}: ${JSON.stringify(errBody)}`,
        );
        if (attempt < retries) {
          await sleep(100 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof NcaError && err.status < 500) {
        throw err;
      }

      lastError = err;

      if (attempt < retries) {
        await sleep(100 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('NCA request failed (no attempts made)');
}

export async function ncaHealthcheck(): Promise<void> {
  await ncaRequest<{ code: number; response: string }>('/v1/toolkit/test', undefined, {
    method: 'GET',
    timeoutMs: 10_000,
    retries: 1,
  });
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => null);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
