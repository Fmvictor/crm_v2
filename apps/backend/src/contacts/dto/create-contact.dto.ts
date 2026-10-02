import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ContactStatus } from '../entities/contact.entity';

export class CreateContactDto {
  @ApiProperty({ example: 'Carlos López' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '+34 600 123 456' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional({ enum: ContactStatus, default: ContactStatus.NEW })
  @IsEnum(ContactStatus)
  @IsOptional()
  status?: ContactStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'UUID del agente asignado' })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;
}
