import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { PUBLIC_USER } from './mentors.service.js';
import {
  EMBEDDING_CLIENT,
  type EmbeddingClient,
} from './embedding.provider.js';
import {
  buildRationale,
  combineScores,
  cosineSimilarity,
  experienceScore,
  matchSkills,
  normalizeTag,
  skillScore,
  uniqueTags,
} from './mentor-matching.scoring.js';
import type {
  MentorRecommendationDto,
  MentorRecommendationResponseDto,
} from './dto/mentor-recommendation-response.dto.js';

type MentorWithUser = Prisma.MentorProfileGetPayload<{
  include: typeof PUBLIC_USER;
}>;

/** Upper bound on mentors scored per request; keeps memory and AI cost bounded. */
export const MAX_CANDIDATES = 500;
/** Texts sent to the embedding API per request. */
export const EMBED_BATCH_SIZE = 32;
/** Mentor text rarely changes, so its vector is cached for a day. */
const EMBEDDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** The embedding model only reads the first few hundred words anyway. */
const MAX_TEXT_LENGTH = 1000;

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class MentorMatchingService {
  private readonly logger = new Logger(MentorMatchingService.name);
  private readonly resultTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(EMBEDDING_CLIENT)
    private readonly embeddings: EmbeddingClient | null,
    config: ConfigService,
  ) {
    this.resultTtlMs =
      config.getOrThrow<number>('RECOMMENDATIONS_CACHE_TTL') * 1000;
  }

  /** Ranked mentor recommendations for the given mentee. */
  async recommend(
    userId: string,
    limit: number,
  ): Promise<MentorRecommendationResponseDto> {
    const mentee = await this.users.findById(userId);
    const interests = uniqueTags(mentee.interests);

    // The key includes the mentee's interests and bio, so editing the
    // profile automatically skips the old cached result.
    const cacheKey = `mentor-recs:${userId}:${limit}:${sha256(
      JSON.stringify([interests.map(normalizeTag).sort(), mentee.bio ?? '']),
    )}`;
    const cached =
      await this.cache.get<MentorRecommendationResponseDto>(cacheKey);
    if (cached) return cached;

    // Sorted by experience so that ties (and the fallback) favour seniority.
    const mentors = await this.prisma.mentorProfile.findMany({
      where: { isActive: true, userId: { not: userId } },
      include: PUBLIC_USER,
      orderBy: [
        { yearsOfExperience: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      take: MAX_CANDIDATES,
    });

    if (interests.length === 0) {
      const result = this.fallback(mentors, limit);
      await this.cache.set(cacheKey, result, this.resultTtlMs);
      return result;
    }

    const semantic = await this.semanticScores(interests, mentee.bio, mentors);
    const items: MentorRecommendationDto[] = mentors.map((mentor, i) => {
      const matchedSkills = matchSkills(interests, mentor.skills);
      const aiScore = semantic ? semantic[i] : null;
      return {
        mentor,
        matchedSkills,
        matchScore: combineScores({
          skill: skillScore(interests.length, matchedSkills.length),
          experience: experienceScore(mentor.yearsOfExperience),
          semantic: aiScore,
        }),
        rationale: buildRationale(
          matchedSkills,
          interests.length,
          mentor.yearsOfExperience,
          aiScore,
        ),
      };
    });
    // Array sort is stable: equal scores keep the experience order above.
    items.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    const result: MentorRecommendationResponseDto = {
      items: items.slice(0, limit),
      isFallback: false,
      semanticScoring: semantic !== null,
    };
    // A degraded result (AI configured but failing) is not cached, so the
    // next request retries the AI instead of serving skill-only scores for hours.
    if (semantic !== null || this.embeddings === null)
      await this.cache.set(cacheKey, result, this.resultTtlMs);
    return result;
  }

  private fallback(
    mentors: readonly MentorWithUser[],
    limit: number,
  ): MentorRecommendationResponseDto {
    return {
      items: mentors.slice(0, limit).map((mentor) => ({
        mentor,
        matchScore: null,
        matchedSkills: [],
        rationale:
          'Add interests to your profile to get personalised matches' +
          (mentor.yearsOfExperience
            ? ` · ${mentor.yearsOfExperience} year${mentor.yearsOfExperience === 1 ? '' : 's'} of experience`
            : ''),
      })),
      isFallback: true,
      semanticScoring: false,
    };
  }

  /**
   * Cosine similarity between the mentee's text and each mentor's text,
   * in the same order as `mentors`. Returns null (never throws) when the
   * AI provider is not configured or fails, so callers fall back to
   * skill overlap.
   */
  private async semanticScores(
    interests: readonly string[],
    bio: string | null,
    mentors: readonly MentorWithUser[],
  ): Promise<number[] | null> {
    if (!this.embeddings || mentors.length === 0) return null;
    const menteeText = [`Interests: ${interests.join(', ')}`, bio?.trim()]
      .filter(Boolean)
      .join('. ');
    const mentorTexts = mentors.map((m) =>
      [
        m.headline,
        m.about,
        m.skills.length ? `Skills: ${m.skills.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('. '),
    );
    try {
      const [menteeVector, ...mentorVectors] = await this.embedAll(
        this.embeddings,
        [menteeText, ...mentorTexts],
      );
      return mentorVectors.map((v) => cosineSimilarity(menteeVector, v));
    } catch (error) {
      this.logger.warn(
        `Semantic scoring unavailable, using skill overlap only: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** Embeds texts, reusing cached vectors and only sending the misses. */
  private async embedAll(
    client: EmbeddingClient,
    texts: readonly string[],
  ): Promise<number[][]> {
    const trimmed = texts.map((t) => t.slice(0, MAX_TEXT_LENGTH));
    const keys = trimmed.map((t) => `embedding:${client.model}:${sha256(t)}`);
    const vectors = await Promise.all(
      keys.map((key) => this.cache.get<number[]>(key)),
    );
    const missing = vectors.flatMap((v, i) => (v ? [] : [i]));
    for (let start = 0; start < missing.length; start += EMBED_BATCH_SIZE) {
      const batch = missing.slice(start, start + EMBED_BATCH_SIZE);
      const fresh = await client.embed(batch.map((i) => trimmed[i]));
      await Promise.all(
        batch.map((i, j) => {
          vectors[i] = fresh[j];
          return this.cache.set(keys[i], fresh[j], EMBEDDING_CACHE_TTL_MS);
        }),
      );
    }
    return vectors.map((v) => {
      if (!v) throw new Error('Missing embedding vector');
      return v;
    });
  }
}
