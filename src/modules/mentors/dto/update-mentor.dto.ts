import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateMentorDto } from './create-mentor.dto.js';
import { IsArray, IsOptional, IsString, IsNotEmpty } from 'class-validator';

class CreateMentorDtoWithoutSkills extends OmitType(CreateMentorDto, [
  'skills',
] as const) {}

export class UpdateMentorDto extends PartialType(CreateMentorDtoWithoutSkills, {
  skipNullProperties: false,
}) {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  skills?: string[];
}
