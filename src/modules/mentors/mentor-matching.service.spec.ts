import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { EMBEDDING_CLIENT } from './embedding.provider.js';
import { MentorMatchingService } from './mentor-matching.service.js';
import {
  buildRationale,
  combineScores,
  cosineSimilarity,
  experienceScore,
  matchSkills,
  skillScore,
  uniqueTags,
} from './mentor-matching.scoring.js';

describe('mentor matching scoring', () => {
  it('matches skills case- and whitespace-insensitively, keeping the mentor spelling', () => {
    expect(
      matchSkills(['react', ' node  js', 'SQL'], ['React', 'Node JS', 'Go']),
    ).toEqual(['React', 'Node JS']);
    expect(matchSkills(['React'], ['Go', 'Rust'])).toEqual([]);
    expect(uniqueTags(['React', 'react ', ' ', 'Go'])).toEqual(['React', 'Go']);
  });

  it('scores skill coverage and caps experience', () => {
    expect(skillScore(3, 3)).toBe(1);
    expect(skillScore(4, 1)).toBe(0.25);
    expect(skillScore(0, 0)).toBe(0);
    expect(experienceScore(null)).toBe(0);
    expect(experienceScore(5)).toBe(0.5);
    expect(experienceScore(25)).toBe(1);
  });

  it('computes cosine similarity and clamps it to 0..1', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it('combines weighted parts and redistributes the semantic weight when AI is off', () => {
    expect(combineScores({ skill: 1, experience: 1, semantic: 1 })).toBe(100);
    expect(combineScores({ skill: 0, experience: 0, semantic: 0 })).toBe(0);
    // 0.5*1 + 0.15*0 + 0.35*0 = 50
    expect(combineScores({ skill: 1, experience: 0, semantic: 0 })).toBe(50);
    // without AI: 0.5 / (0.5 + 0.15) ≈ 77
    expect(combineScores({ skill: 1, experience: 0, semantic: null })).toBe(77);
    expect(combineScores({ skill: 1, experience: 1, semantic: null })).toBe(
      100,
    );
  });

  it('explains the match in one line', () => {
    expect(buildRationale(['React'], 2, 1, 0.6)).toBe(
      'Shares 1 of your 2 interests: React · 1 year of experience · Profile closely matches your goals',
    );
    expect(buildRationale([], 2, null, null)).toBe(
      'No direct overlap with your interests',
    );
    expect(buildRationale([], 2, 0, 0.35)).toContain('Related background');
  });
});

describe('MentorMatchingService', () => {
  let service: MentorMatchingService;
  const mentorProfile = { findMany: vi.fn() };
  const prisma = { mentorProfile };
  const users = { findById: vi.fn() };
  const store = new Map<string, unknown>();
  const cache = {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve(value);
    }),
  };
  const embeddings = { model: 'test/model', embed: vi.fn() };
  const config = { getOrThrow: vi.fn().mockReturnValue(3600) };

  const mentor = (
    id: string,
    skills: string[],
    yearsOfExperience: number | null,
  ) => ({
    id,
    userId: `user-${id}`,
    headline: `Mentor ${id}`,
    about: `About ${id}`,
    skills,
    yearsOfExperience,
    isActive: true,
    user: { name: id, avatarUrl: null, bio: null },
  });
  const mentee = (interests: string[], bio: string | null = null) => ({
    id: 'mentee',
    interests,
    bio,
  });

  const build = async (embeddingClient: typeof embeddings | null) => {
    const module = await Test.createTestingModule({
      providers: [
        MentorMatchingService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: EMBEDDING_CLIENT, useValue: embeddingClient },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    return module.get(MentorMatchingService);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    store.clear();
    service = await build(null);
  });

  it('ranks by skill overlap, excludes inactive mentors and the mentee, and caches the result', async () => {
    users.findById.mockResolvedValue(mentee(['React', 'SQL']));
    mentorProfile.findMany.mockResolvedValue([
      mentor('senior-unrelated', ['Go'], 20),
      mentor('perfect', ['react', 'SQL'], 2),
      mentor('half', ['React'], 0),
    ]);

    const result = await service.recommend('mentee', 10);

    expect(mentorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, userId: { not: 'mentee' } },
      }),
    );
    expect(result.isFallback).toBe(false);
    expect(result.semanticScoring).toBe(false);
    expect(result.items.map((i) => i.mentor.id)).toEqual([
      'perfect',
      'half',
      'senior-unrelated',
    ]);
    expect(result.items[0]).toMatchObject({
      matchedSkills: ['react', 'SQL'],
      // (0.5*1 + 0.15*0.2) / 0.65 ≈ 82
      matchScore: 82,
    });
    expect(result.items[2]).toMatchObject({
      matchedSkills: [],
      matchScore: 23,
    });

    await service.recommend('mentee', 10);
    expect(mentorProfile.findMany).toHaveBeenCalledTimes(1);
  });

  it('applies the limit and returns an empty list when there are no mentors', async () => {
    users.findById.mockResolvedValue(mentee(['React']));
    mentorProfile.findMany.mockResolvedValue([
      mentor('a', ['React'], 1),
      mentor('b', ['React'], 1),
    ]);
    expect((await service.recommend('mentee', 1)).items).toHaveLength(1);

    store.clear();
    mentorProfile.findMany.mockResolvedValue([]);
    expect((await service.recommend('mentee', 10)).items).toEqual([]);
  });

  it('falls back to experienced mentors when the mentee has no interests', async () => {
    users.findById.mockResolvedValue(mentee([' '], 'I like code'));
    mentorProfile.findMany.mockResolvedValue([
      mentor('senior', ['Go'], 12),
      mentor('junior', [], null),
    ]);
    const result = await service.recommend('mentee', 10);
    expect(result.isFallback).toBe(true);
    expect(result.items.map((i) => i.mentor.id)).toEqual(['senior', 'junior']);
    expect(result.items[0]).toMatchObject({
      matchScore: null,
      matchedSkills: [],
    });
    expect(result.items[0].rationale).toContain('12 years');
  });

  it('propagates a missing mentee as an error', async () => {
    users.findById.mockRejectedValue(new Error('not found'));
    await expect(service.recommend('ghost', 10)).rejects.toThrow('not found');
  });

  describe('with an AI provider', () => {
    beforeEach(async () => {
      service = await build(embeddings);
    });

    it('adds semantic similarity, which can rank a mentor without exact skill overlap', async () => {
      users.findById.mockResolvedValue(mentee(['frontend'], 'Learning React'));
      mentorProfile.findMany.mockResolvedValue([
        mentor('backend', ['Java'], 5),
        mentor('ui', ['React'], 5),
      ]);
      // mentee, backend, ui
      embeddings.embed.mockResolvedValue([
        [1, 0],
        [0, 1],
        [0.9, 0.1],
      ]);

      const result = await service.recommend('mentee', 10);

      expect(result.semanticScoring).toBe(true);
      expect(result.items[0].mentor.id).toBe('ui');
      expect(result.items[0].matchScore).toBeGreaterThan(
        result.items[1].matchScore ?? 0,
      );
      expect(embeddings.embed).toHaveBeenCalledTimes(1);
      expect(embeddings.embed.mock.calls[0][0]).toHaveLength(3);
    });

    it('reuses cached vectors and only embeds texts it has not seen', async () => {
      mentorProfile.findMany.mockResolvedValue([mentor('a', ['Go'], 1)]);
      embeddings.embed.mockImplementation((texts: string[]) =>
        Promise.resolve(texts.map(() => [1, 0])),
      );
      users.findById.mockResolvedValue(mentee(['Go']));
      await service.recommend('mentee', 10);
      users.findById.mockResolvedValue(mentee(['Go', 'Rust']));
      await service.recommend('mentee', 10);

      // second call: only the changed mentee text is embedded
      expect(embeddings.embed).toHaveBeenCalledTimes(2);
      expect(embeddings.embed.mock.calls[1][0]).toHaveLength(1);
    });

    it('degrades to skill overlap when the AI fails, and does not cache that result', async () => {
      users.findById.mockResolvedValue(mentee(['React']));
      mentorProfile.findMany.mockResolvedValue([mentor('a', ['React'], 0)]);
      embeddings.embed.mockRejectedValue(new Error('timeout'));

      const result = await service.recommend('mentee', 10);

      expect(result.semanticScoring).toBe(false);
      expect(result.items[0]).toMatchObject({ matchScore: 77 });
      await service.recommend('mentee', 10);
      expect(embeddings.embed).toHaveBeenCalledTimes(2);
    });
  });
});
