import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Amr Khaled' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description:
      'At least 8 and no more than 72 bytes, with uppercase, lowercase, numeric, and special characters',
    example: 'SecurePass1!',
  })
  @IsString()
  @IsByteLength(8, 72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
  password!: string;
}
