import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { MentorProfileResponseDto } from './mentor-profile-response.dto.js';

export class UserResponseDto {
  @ApiProperty({ description: 'Unique identifier of the user' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Email address of the user' })
  @Expose()
  email!: string;

  @ApiProperty({ description: 'Full name of the user' })
  @Expose()
  name!: string;

  @ApiPropertyOptional({
    description: 'Avatar URL of the user',
    nullable: true,
  })
  @Expose()
  avatarUrl!: string | null;

  @ApiPropertyOptional({ description: 'Short bio of the user', nullable: true })
  @Expose()
  bio!: string | null;

  @ApiProperty({ description: 'List of user interests/topics', type: [String] })
  @Expose()
  interests!: string[];

  @ApiPropertyOptional({
    description: 'Associated mentor profile if user is a mentor',
    type: () => MentorProfileResponseDto,
    nullable: true,
  })
  @Expose()
  @Type(() => MentorProfileResponseDto)
  mentorProfile!: MentorProfileResponseDto | null;

  @ApiProperty({ description: 'Account creation timestamp' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ description: 'Account last update timestamp' })
  @Expose()
  updatedAt!: Date;
}
