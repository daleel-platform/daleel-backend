import { ConfigService } from '@nestjs/config';

export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');

/**
 * Turns texts into vectors ("embeddings"). Texts with similar meaning get
 * vectors that point in similar directions, which is what semantic matching
 * compares. Returns one vector per input text, in the same order.
 */
export interface EmbeddingClient {
  readonly model: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

const HF_INFERENCE_URL = 'https://router.huggingface.co/hf-inference/models';

function isVectorList(value: unknown, expected: number): value is number[][] {
  if (!Array.isArray(value) || value.length !== expected) return false;
  const vectors: unknown[] = value;
  const first: unknown = vectors[0];
  const dimensions = Array.isArray(first) ? first.length : 0;
  return (
    dimensions > 0 &&
    vectors.every(
      (vector) =>
        Array.isArray(vector) &&
        vector.length === dimensions &&
        vector.every((n) => typeof n === 'number' && Number.isFinite(n)),
    )
  );
}

export class HuggingFaceEmbeddingClient implements EmbeddingClient {
  constructor(
    private readonly token: string,
    readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.fetchFn(
      `${HF_INFERENCE_URL}/${this.model}/pipeline/feature-extraction`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: texts }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (!response.ok)
      throw new Error(
        `Embedding request failed with status ${response.status}`,
      );
    const body: unknown = await response.json();
    if (!isVectorList(body, texts.length))
      throw new Error('Embedding response has an unexpected shape');
    return body;
  }
}

/** Provides an EmbeddingClient, or null when HF_API_TOKEN is not configured. */
export const EmbeddingProvider = {
  provide: EMBEDDING_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): EmbeddingClient | null => {
    const token = config.get<string>('HF_API_TOKEN');
    if (!token) return null;
    return new HuggingFaceEmbeddingClient(
      token,
      config.getOrThrow<string>('EMBEDDINGS_MODEL'),
      config.getOrThrow<number>('EMBEDDINGS_TIMEOUT_MS'),
    );
  },
};
