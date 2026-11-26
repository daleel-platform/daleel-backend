import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { PaginatedResponseDto } from '../../../common/pagination/paginated-response.dto.js';

export class MentorPublicUserDto {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() name: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) avatarUrl:
    string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) bio: string | null;
}

export class MentorExperienceResponseDto {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() title: string;
  @Expose() @ApiProperty() company: string;
  @Expose() @ApiProperty() startYear: number;
  @Expose() @ApiProperty({ type: Number, nullable: true }) endYear:
    number | null;
  @Expose() @ApiProperty() summary: string;
}

export class MentorResponseDto {
  @Expose() @ApiProperty() id: string;
  @Expose() @ApiProperty() headline: string;
  @Expose() @ApiProperty() about: string;
  @Expose() @ApiProperty({ type: [String] }) skills: string[];
  @Expose() @ApiProperty({ type: Number, nullable: true }) yearsOfExperience:
    number | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) linkedinUrl:
    string | null;
  @Expose() @ApiProperty() isActive: boolean;
  @Expose() @ApiProperty() createdAt: Date;
  @Expose() @ApiProperty() updatedAt: Date;
  @Expose()
  @Type(() => MentorPublicUserDto)
  @ApiProperty({ type: MentorPublicUserDto })
  user: MentorPublicUserDto;
  @Expose()
  @Type(() => MentorExperienceResponseDto)
  @ApiProperty({ type: [MentorExperienceResponseDto], required: false })
  experiences?: MentorExperienceResponseDto[];
}

export class PaginatedMentorResponseDto extends PaginatedResponseDto(
  MentorResponseDto,
) {}
