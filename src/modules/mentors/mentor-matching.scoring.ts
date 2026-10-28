/**
 * Pure scoring math for mentor recommendations. No database, no network:
 * every function here takes plain values and returns plain values, so it is
 * easy to test and reason about.
 *
 * finalScore = skill * skillScore + experience * expScore + semantic * aiScore
 */
export const MATCH_WEIGHTS = {
  skill: 0.5,
  experience: 0.15,
  semantic: 0.35,
} as const;

/** Experience stops adding to the score after this many years. */
export const EXPERIENCE_CAP_YEARS = 10;

/** "  Node JS " and "node js" are treated as the same tag. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Removes empty and duplicate tags (case-insensitive), keeping first spelling. */
export function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(tag.trim());
    }
  }
  return result;
}

/** The mentor's skills (in the mentor's spelling) that the mentee is interested in. */
export function matchSkills(
  interests: readonly string[],
  skills: readonly string[],
): string[] {
  const wanted = new Set(interests.map(normalizeTag));
  return uniqueTags(skills).filter((skill) => wanted.has(normalizeTag(skill)));
}

/** Share of the mentee's interests this mentor covers, 0..1. */
export function skillScore(
  interestCount: number,
  matchedCount: number,
): number {
  if (interestCount <= 0) return 0;
  return Math.min(matchedCount / interestCount, 1);
}

/** 0 years → 0, EXPERIENCE_CAP_YEARS or more → 1, linear in between. */
export function experienceScore(years: number | null): number {
  const value = Math.max(0, Math.min(years ?? 0, EXPERIENCE_CAP_YEARS));
  return value / EXPERIENCE_CAP_YEARS;
}

/**
 * How closely two vectors point in the same direction: 1 = same meaning,
 * 0 = unrelated. Negative values are clamped to 0. Mismatched or zero
 * vectors score 0.
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(cosine, 1));
}

export interface ScoreParts {
  readonly skill: number;
  readonly experience: number;
  /** null when semantic scoring is unavailable; its weight is redistributed. */
  readonly semantic: number | null;
}

/** Weighted sum of the parts, as a whole percentage 0..100. */
export function combineScores(parts: ScoreParts): number {
  const w = MATCH_WEIGHTS;
  const total =
    parts.semantic === null
      ? (w.skill * parts.skill + w.experience * parts.experience) /
        (w.skill + w.experience)
      : w.skill * parts.skill +
        w.experience * parts.experience +
        w.semantic * parts.semantic;
  return Math.round(Math.max(0, Math.min(total, 1)) * 100);
}

/** One short human-readable sentence explaining the score. */
export function buildRationale(
  matchedSkills: readonly string[],
  interestCount: number,
  years: number | null,
  semantic: number | null,
): string {
  const parts: string[] = [];
  if (matchedSkills.length > 0) {
    parts.push(
      `Shares ${matchedSkills.length} of your ${interestCount} interests: ${matchedSkills.join(', ')}`,
    );
  } else {
    parts.push('No direct overlap with your interests');
  }
  if (years !== null && years > 0)
    parts.push(`${years} year${years === 1 ? '' : 's'} of experience`);
  if (semantic !== null && semantic >= 0.5)
    parts.push('Profile closely matches your goals');
  else if (semantic !== null && semantic >= 0.3)
    parts.push('Related background');
  return parts.join(' · ');
}
