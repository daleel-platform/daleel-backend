import { ConfigService } from '@nestjs/config';

export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');

/**
 * The embedding model, run locally inside this server with transformers.js.
 * BGE models are trained with CLS pooling; q8 is the quantized ONNX build
 * (smaller download, faster on CPU, negligible accuracy loss).
 * The model is downloaded from the Hugging Face Hub on first use and cached.
 */
export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';

/**
 * Turns texts into vectors ("embeddings"). Texts with similar meaning get
 * vectors that point in similar directions, which is what semantic matching
 * compares. Returns one vector per input text, in the same order.
 */
export interface EmbeddingClient {
  readonly model: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export type Extractor = (
  texts: string[],
  options: { pooling: 'cls'; normalize: boolean },
) => Promise<{ tolist(): unknown }>;

async function loadExtractor(model: string): Promise<Extractor> {
  // Imported lazily so the native ONNX runtime only loads when embeddings are enabled.
  const { pipeline } = await import('@huggingface/transformers');
  return (await pipeline('feature-extraction', model, {
    dtype: 'q8',
  })) as unknown as Extractor;
}

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

export class LocalEmbeddingClient implements EmbeddingClient {
  private extractor: Promise<Extractor> | null = null;

  constructor(
    readonly model: string,
    private readonly load: (
      model: string,
    ) => Promise<Extractor> = loadExtractor,
  ) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const output = await extractor([...texts], {
      pooling: 'cls',
      normalize: true,
    });
    const vectors = output.tolist();
    if (!isVectorList(vectors, texts.length))
      throw new Error('Embedding output has an unexpected shape');
    return vectors;
  }

  /** Loads the model once; a failed load is retried on the next call. */
  private getExtractor(): Promise<Extractor> {
    this.extractor ??= this.load(this.model).catch((error: unknown) => {
      this.extractor = null;
      throw error;
    });
    return this.extractor;
  }
}

/** Provides an EmbeddingClient, or null when EMBEDDINGS_ENABLED is false. */
export const EmbeddingProvider = {
  provide: EMBEDDING_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): EmbeddingClient | null =>
    config.get<boolean>('EMBEDDINGS_ENABLED')
      ? new LocalEmbeddingClient(EMBEDDING_MODEL)
      : null,
};
