import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isEndYearAfterOrEqualStartYear', async: false })
class IsEndYearAfterOrEqualStartYear implements ValidatorConstraintInterface {
  validate(endYear: unknown, args: ValidationArguments): boolean {
    if (typeof endYear !== 'number') return true;
    const { startYear } = args.object as MentorExperienceInputDto;
    return typeof startYear !== 'number' || endYear >= startYear;
  }

  defaultMessage(): string {
    return 'endYear must be greater than or equal to startYear';
  }
}

export class MentorExperienceInputDto {
  @ApiProperty({ example: 'Staff Software Engineer' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'Stripe' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  company: string;

  @ApiProperty({ minimum: 1960, maximum: 2035, example: 2021 })
  @IsInt()
  @Min(1960)
  @Max(2035)
  startYear: number;

  @ApiPropertyOptional({
    minimum: 1960,
    maximum: 2035,
    nullable: true,
    example: 2024,
  })
  @IsOptional()
  @IsInt()
  @Min(1960)
  @Max(2035)
  @Validate(IsEndYearAfterOrEqualStartYear)
  endYear?: number | null;

  @ApiProperty({
    example:
      'Led distributed payment ledger architecture and mentored 8 senior engineers.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  summary: string;
}

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
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((skill: unknown) =>
          typeof skill === 'string' ? skill.trim() : skill,
        )
      : value,
  )
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

  @ApiPropertyOptional({ type: [MentorExperienceInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MentorExperienceInputDto)
  experiences?: MentorExperienceInputDto[];
}
