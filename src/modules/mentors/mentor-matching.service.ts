import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { PUBLIC_USER } from './mentors.service.js';
import { MentorEmbeddingService } from './mentor-embedding.service.js';
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

/** Upper bound on mentors scored per request; keeps memory bounded. */
export const MAX_CANDIDATES = 500;

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** The public part of a mentor; stored vectors never leave this service. */
function publicMentor(mentor: MentorWithUser) {
  const { embedding: _embedding, embeddingModel: _model, ...profile } = mentor;
  return profile;
}

@Injectable()
export class MentorMatchingService {
  private readonly resultTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly embeddings: MentorEmbeddingService,
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

    // Only the mentee is embedded here; mentor vectors were stored when
    // each profile was saved. A mentor whose vector is missing or stale is
    // scored without the semantic part rather than embedded on this request.
    const model = this.embeddings.model;
    const menteeVector = await this.embeddings.embedMentee(
      interests,
      mentee.bio,
    );
    const items: MentorRecommendationDto[] = mentors.map((mentor) => {
      const matchedSkills = matchSkills(interests, mentor.skills);
      const aiScore =
        menteeVector && mentor.embeddingModel === model
          ? cosineSimilarity(menteeVector, mentor.embedding)
          : null;
      return {
        mentor: publicMentor(mentor),
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
      semanticScoring: menteeVector !== null,
    };
    // A degraded result (AI enabled but failing) is not cached, so the next
    // request retries the AI instead of serving skill-only scores for an hour.
    if (menteeVector !== null || model === null)
      await this.cache.set(cacheKey, result, this.resultTtlMs);
    return result;
  }

  private fallback(
    mentors: readonly MentorWithUser[],
    limit: number,
  ): MentorRecommendationResponseDto {
    return {
      items: mentors.slice(0, limit).map((mentor) => ({
        mentor: publicMentor(mentor),
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
}
