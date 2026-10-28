import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { MentorResponseDto } from './mentor-response.dto.js';

export class MentorRecommendationDto {
  @Expose()
  @Type(() => MentorResponseDto)
  @ApiProperty({ type: MentorResponseDto })
  mentor: MentorResponseDto;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100,
    description: 'Compatibility percentage; null for fallback results',
  })
  matchScore: number | null;

  @Expose()
  @ApiProperty({
    type: [String],
    description: "Mentor skills that match the mentee's interests",
  })
  matchedSkills: string[];

  @Expose()
  @ApiProperty({ description: 'Short explanation of the match' })
  rationale: string;
}

export class MentorRecommendationResponseDto {
  @Expose()
  @Type(() => MentorRecommendationDto)
  @ApiProperty({ type: [MentorRecommendationDto] })
  items: MentorRecommendationDto[];

  @Expose()
  @ApiProperty({
    description:
      'True when the mentee has no interests, so mentors are ranked by experience instead of match',
  })
  isFallback: boolean;

  @Expose()
  @ApiProperty({
    description:
      'True when AI semantic similarity contributed to the scores; false when only skill overlap and experience were used',
  })
  semanticScoring: boolean;
}
