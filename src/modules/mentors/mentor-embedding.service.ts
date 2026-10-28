import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  EMBEDDING_CLIENT,
  type EmbeddingClient,
} from './embedding.provider.js';

/** Mentors embedded per batch during the startup backfill. */
const BACKFILL_BATCH_SIZE = 32;

/**
 * BGE models are trained to compare a short query against longer passages
 * when the query carries this instruction (see the bge-small-en-v1.5 model card).
 * Only the mentee side (the "query") gets it; mentor profiles are the passages.
 */
const QUERY_INSTRUCTION =
  'Represent this sentence for searching relevant passages: ';

interface MentorText {
  readonly headline: string;
  readonly about: string;
  readonly skills: readonly string[];
}

export function mentorText(mentor: MentorText): string {
  return [
    mentor.headline,
    mentor.about,
    mentor.skills.length ? `Skills: ${mentor.skills.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

export function menteeText(
  interests: readonly string[],
  bio: string | null,
): string {
  return (
    QUERY_INSTRUCTION +
    [`Interests: ${interests.join(', ')}`, bio?.trim()]
      .filter(Boolean)
      .join('. ')
  );
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Owns mentor vectors: computed when a profile is written and stored in the
 * database, so a recommendation request only has to embed the mentee.
 */
@Injectable()
export class MentorEmbeddingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MentorEmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_CLIENT)
    private readonly embeddings: EmbeddingClient | null,
  ) {}

  /** The active model, or null when embeddings are disabled. */
  get model(): string | null {
    return this.embeddings?.model ?? null;
  }

  /**
   * Stores a fresh vector for one mentor. Never throws: on failure the
   * profile keeps `embeddingModel = null` (set by the profile write) and the
   * next startup backfill retries it.
   */
  async refresh(id: string, mentor: MentorText): Promise<void> {
    if (!this.embeddings) return;
    try {
      const [embedding] = await this.embeddings.embed([mentorText(mentor)]);
      await this.prisma.mentorProfile.updateMany({
        where: { id },
        data: { embedding, embeddingModel: this.embeddings.model },
      });
    } catch (error) {
      this.logger.warn(`Could not embed mentor ${id}: ${describe(error)}`);
    }
  }

  /** The mentee's vector, or null when embeddings are disabled or fail. */
  async embedMentee(
    interests: readonly string[],
    bio: string | null,
  ): Promise<number[] | null> {
    if (!this.embeddings) return null;
    try {
      const [vector] = await this.embeddings.embed([
        menteeText(interests, bio),
      ]);
      return vector;
    } catch (error) {
      this.logger.warn(
        `Semantic scoring unavailable, using skill overlap only: ${describe(error)}`,
      );
      return null;
    }
  }

  /** Embeds every mentor whose vector is missing or came from another model. */
  async backfill(): Promise<number> {
    if (!this.embeddings) return 0;
    const model = this.embeddings.model;
    let done = 0;
    for (;;) {
      const stale = await this.prisma.mentorProfile.findMany({
        where: {
          OR: [{ embeddingModel: null }, { embeddingModel: { not: model } }],
        },
        select: { id: true, headline: true, about: true, skills: true },
        orderBy: { id: 'asc' },
        take: BACKFILL_BATCH_SIZE,
      });
      if (stale.length === 0) return done;
      const vectors = await this.embeddings.embed(stale.map(mentorText));
      await this.prisma.$transaction(
        stale.map((mentor, i) =>
          this.prisma.mentorProfile.updateMany({
            where: { id: mentor.id },
            data: { embedding: vectors[i], embeddingModel: model },
          }),
        ),
      );
      done += stale.length;
    }
  }

  /**
   * Loads the model and backfills in the background at startup, so the first
   * real request is fast. Does not delay the server from starting.
   */
  onApplicationBootstrap(): void {
    if (!this.embeddings) return;
    const client = this.embeddings;
    void (async () => {
      try {
        await client.embed(['warm up']);
        const count = await this.backfill();
        this.logger.log(
          `Embedding model ${client.model} ready; ${count} mentor(s) backfilled`,
        );
      } catch (error) {
        this.logger.warn(`Embedding warm-up failed: ${describe(error)}`);
      }
    })();
  }
}
