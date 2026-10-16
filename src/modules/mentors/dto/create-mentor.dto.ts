import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsUrl,
} from 'class-validator';

export class CreateMentorDto {
  @ApiProperty({ example: 'Backend developer and mentor' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  headline: string;

  @ApiProperty({ example: 'I help developers learn NestJS.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  about: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    example: ['NestJS', 'TypeScript'],
  })
  @Transform(({ value }: { value: unknown }) => {
    let skills: unknown = value;
    if (typeof value === 'string') {
      if (value.trim().startsWith('[')) {
        try {
          skills = JSON.parse(value);
        } catch {
          return value;
        }
      } else {
        skills = value.split(',');
      }
    }
    return Array.isArray(skills)
      ? skills.map((skill: unknown) =>
          typeof skill === 'string' ? skill.trim() : skill,
        )
      : skills;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills: string[];

  @ApiProperty({ minimum: 1, maximum: 60, example: 3 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(60)
  yearsOfExperience: number;

  @ApiPropertyOptional({ example: 'https://www.linkedin.com/in/example' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      host_whitelist: ['linkedin.com', 'www.linkedin.com'],
      disallow_auth: true,
    },
    {
      message:
        'linkedinUrl must be an HTTP or HTTPS URL on linkedin.com or www.linkedin.com',
    },
  )
  linkedinUrl?: string;
}
