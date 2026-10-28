import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EMBEDDING_CLIENT } from './embedding.provider.js';
import {
  MentorEmbeddingService,
  menteeText,
  mentorText,
} from './mentor-embedding.service.js';

describe('MentorEmbeddingService', () => {
  const mentorProfile = { findMany: vi.fn(), updateMany: vi.fn() };
  const prisma = {
    mentorProfile,
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const client = { model: 'test/model', embed: vi.fn() };
  const mentor = {
    headline: 'Frontend',
    about: 'I teach UI',
    skills: ['React'],
  };

  const build = async (embeddings: typeof client | null) => {
    const module = await Test.createTestingModule({
      providers: [
        MentorEmbeddingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EMBEDDING_CLIENT, useValue: embeddings },
      ],
    }).compile();
    return module.get(MentorEmbeddingService);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mentorProfile.updateMany.mockResolvedValue({ count: 1 });
  });

  it('builds the texts that get embedded', () => {
    expect(mentorText(mentor)).toBe('Frontend. I teach UI. Skills: React');
    expect(mentorText({ ...mentor, skills: [] })).toBe('Frontend. I teach UI');
    expect(menteeText(['React', 'SQL'], ' Student ')).toMatch(
      /^Represent this sentence for searching relevant passages: Interests: React, SQL\. Student$/,
    );
    expect(menteeText(['React'], null)).toMatch(/Interests: React$/);
  });

  it('stores a fresh vector with its model when a profile is written', async () => {
    const service = await build(client);
    client.embed.mockResolvedValue([[0.6, 0.8]]);

    await service.refresh('m1', mentor);

    expect(client.embed).toHaveBeenCalledWith([mentorText(mentor)]);
    expect(mentorProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { embedding: [0.6, 0.8], embeddingModel: 'test/model' },
    });
  });

  it('never throws from refresh, leaving the profile for the backfill', async () => {
    const service = await build(client);
    client.embed.mockRejectedValue(new Error('model failed'));
    await expect(service.refresh('m1', mentor)).resolves.toBeUndefined();
    expect(mentorProfile.updateMany).not.toHaveBeenCalled();
  });

  it('embeds the mentee, or returns null when disabled or failing', async () => {
    const service = await build(client);
    client.embed.mockResolvedValue([[1, 0]]);
    expect(await service.embedMentee(['React'], null)).toEqual([1, 0]);
    client.embed.mockRejectedValue(new Error('model failed'));
    expect(await service.embedMentee(['React'], null)).toBeNull();

    const disabled = await build(null);
    expect(disabled.model).toBeNull();
    expect(await disabled.embedMentee(['React'], null)).toBeNull();
    await disabled.refresh('m1', mentor);
    expect(await disabled.backfill()).toBe(0);
    disabled.onApplicationBootstrap();
    expect(client.embed).toHaveBeenCalledTimes(2);
  });

  it('backfills missing or other-model vectors in batches until none are left', async () => {
    const service = await build(client);
    mentorProfile.findMany
      .mockResolvedValueOnce([
        { id: 'a', ...mentor },
        { id: 'b', ...mentor },
      ])
      .mockResolvedValueOnce([]);
    client.embed.mockResolvedValue([
      [1, 0],
      [0, 1],
    ]);

    expect(await service.backfill()).toBe(2);

    expect(mentorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { embeddingModel: null },
            { embeddingModel: { not: 'test/model' } },
          ],
        },
      }),
    );
    expect(mentorProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { embedding: [0, 1], embeddingModel: 'test/model' },
    });
  });

  it('warms up the model and backfills at startup without blocking or throwing', async () => {
    const service = await build(client);
    client.embed.mockResolvedValue([[1, 0]]);
    mentorProfile.findMany.mockResolvedValue([]);

    service.onApplicationBootstrap();
    await vi.waitFor(() => expect(mentorProfile.findMany).toHaveBeenCalled());
    expect(client.embed).toHaveBeenCalledWith(['warm up']);

    client.embed.mockRejectedValue(new Error('no network'));
    expect(() => service.onApplicationBootstrap()).not.toThrow();
  });
});
