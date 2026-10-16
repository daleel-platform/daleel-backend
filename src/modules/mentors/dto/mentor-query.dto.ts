import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';

export class MentorQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Exact, case-sensitive skill names; matches ANY selected skill. Repeat the skills parameter for multiple values.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? [value.trim()]
      : Array.isArray(value)
        ? value.map((skill: unknown) =>
            typeof skill === 'string' ? skill.trim() : skill,
          )
        : value,
  )
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills?: string[];

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 60,
    description: 'Minimum years of experience',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  minExperience?: number;

  @ApiPropertyOptional({
    description: 'Case-insensitive search in user name or headline',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
