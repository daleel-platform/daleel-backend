import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import {
  EmbeddingProvider,
  HuggingFaceEmbeddingClient,
} from './embedding.provider.js';

const respond = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('HuggingFaceEmbeddingClient', () => {
  it('posts texts to the feature-extraction endpoint and returns the vectors', async () => {
    const fetchFn = respond([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const client = new HuggingFaceEmbeddingClient(
      'token',
      'owner/model',
      1000,
      fetchFn,
    );

    expect(await client.embed(['a', 'b'])).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://router.huggingface.co/hf-inference/models/owner/model/pipeline/feature-extraction',
    );
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' });
    expect(JSON.parse(init.body as string)).toEqual({ inputs: ['a', 'b'] });
  });

  it('skips the network for an empty input', async () => {
    const fetchFn = vi.fn();
    const client = new HuggingFaceEmbeddingClient('t', 'o/m', 1000, fetchFn);
    expect(await client.embed([])).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects HTTP errors and malformed responses', async () => {
    const make = (fetchFn: typeof fetch) =>
      new HuggingFaceEmbeddingClient('t', 'o/m', 1000, fetchFn);
    await expect(make(respond({}, 503)).embed(['a'])).rejects.toThrow('503');
    for (const bad of [
      [[0.1]], // wrong count
      [[0.1], ['x']],
      [[0.1], [0.1, 0.2]], // inconsistent dimensions
      { error: 'loading' },
      [[], []],
    ]) {
      await expect(make(respond(bad)).embed(['a', 'b'])).rejects.toThrow(
        'unexpected shape',
      );
    }
  });
});

describe('EmbeddingProvider', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string) => values[key],
      getOrThrow: (key: string) => values[key],
    }) as unknown as ConfigService;

  it('is disabled without a token and enabled with one', () => {
    expect(EmbeddingProvider.useFactory(config({}))).toBeNull();
    const client = EmbeddingProvider.useFactory(
      config({
        HF_API_TOKEN: 'token',
        EMBEDDINGS_MODEL: 'owner/model',
        EMBEDDINGS_TIMEOUT_MS: 3000,
      }),
    );
    expect(client?.model).toBe('owner/model');
  });
});
