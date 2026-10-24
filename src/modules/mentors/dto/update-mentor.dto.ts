import { PartialType } from '@nestjs/swagger';
import { CreateMentorDto } from './create-mentor.dto.js';

export class UpdateMentorDto extends PartialType(CreateMentorDto) {}
