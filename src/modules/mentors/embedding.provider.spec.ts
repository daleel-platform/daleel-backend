import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_MODEL,
  EmbeddingProvider,
  type Extractor,
  LocalEmbeddingClient,
} from './embedding.provider.js';

const extractorReturning = (list: unknown) =>
  vi.fn<Extractor>().mockResolvedValue({ tolist: () => list });

describe('LocalEmbeddingClient', () => {
  it('loads the model once and returns CLS-pooled, normalized vectors', async () => {
    const extractor = extractorReturning([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const load = vi.fn().mockResolvedValue(extractor);
    const client = new LocalEmbeddingClient('owner/model', load);

    expect(await client.embed(['a', 'b'])).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    await client.embed(['a', 'b']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('owner/model');
    expect(extractor).toHaveBeenCalledWith(['a', 'b'], {
      pooling: 'cls',
      normalize: true,
    });
  });

  it('skips the model for an empty input', async () => {
    const load = vi.fn();
    const client = new LocalEmbeddingClient('o/m', load);
    expect(await client.embed([])).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('retries a failed model load on the next call', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('download failed'))
      .mockResolvedValueOnce(extractorReturning([[1, 0]]));
    const client = new LocalEmbeddingClient('o/m', load);

    await expect(client.embed(['a'])).rejects.toThrow('download failed');
    expect(await client.embed(['a'])).toEqual([[1, 0]]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed model output', async () => {
    for (const bad of [
      [[0.1]], // wrong count
      [[0.1], ['x']],
      [[0.1], [0.1, 0.2]], // inconsistent dimensions
      [[[0.1]], [[0.2]]], // unpooled token vectors
      [[], []],
    ]) {
      const client = new LocalEmbeddingClient('o/m', () =>
        Promise.resolve(extractorReturning(bad)),
      );
      await expect(client.embed(['a', 'b'])).rejects.toThrow(
        'unexpected shape',
      );
    }
  });
});

describe('EmbeddingProvider', () => {
  const config = (enabled: boolean) =>
    ({ get: () => enabled }) as unknown as ConfigService;

  it('is null when disabled and a local client for the model when enabled', () => {
    expect(EmbeddingProvider.useFactory(config(false))).toBeNull();
    expect(EmbeddingProvider.useFactory(config(true))?.model).toBe(
      EMBEDDING_MODEL,
    );
  });
});
