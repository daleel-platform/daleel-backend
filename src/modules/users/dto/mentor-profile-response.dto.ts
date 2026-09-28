import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class MentorProfileResponseDto {
  @ApiProperty({ description: 'Unique identifier of the mentor profile' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'ID of the associated user' })
  @Expose()
  userId!: string;

  @ApiProperty({ description: 'Professional headline/tagline' })
  @Expose()
  headline!: string;

  @ApiProperty({ description: 'Detailed about/bio for mentoring' })
  @Expose()
  about!: string;

  @ApiProperty({ description: 'List of mentor skills', type: [String] })
  @Expose()
  skills!: string[];

  @ApiPropertyOptional({
    description: 'Years of professional experience',
    nullable: true,
  })
  @Expose()
  yearsOfExperience!: number | null;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL', nullable: true })
  @Expose()
  linkedinUrl!: string | null;

  @ApiProperty({
    description: 'Whether the mentor profile is currently active',
  })
  @Expose()
  isActive!: boolean;

  @ApiProperty({ description: 'Date the mentor profile was created' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ description: 'Date the mentor profile was last updated' })
  @Expose()
  updatedAt!: Date;
}
