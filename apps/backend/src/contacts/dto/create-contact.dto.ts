import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ContactSource, ContactStatus } from '../entities/contact.entity';

export class CreateContactDto {
  @ApiProperty({ example: 'Carlos López' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'carlos@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: ContactStatus, default: ContactStatus.NEW })
  @IsEnum(ContactStatus)
  @IsOptional()
  status?: ContactStatus;

  @ApiPropertyOptional({ enum: ContactSource, default: ContactSource.OTHER })
  @IsEnum(ContactSource)
  @IsOptional()
  source?: ContactSource;

  @ApiPropertyOptional({ example: 'Curso de Marketing Digital' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  courseInterest?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'UUID del agente asignado' })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;
}
