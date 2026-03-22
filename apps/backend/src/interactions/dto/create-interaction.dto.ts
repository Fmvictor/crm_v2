import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { InteractionDirection, InteractionType } from '../entities/interaction.entity';

export class CreateInteractionDto {
  @ApiProperty({ enum: InteractionType })
  @IsEnum(InteractionType)
  type: InteractionType;

  @ApiPropertyOptional({ enum: InteractionDirection })
  @IsEnum(InteractionDirection)
  @IsOptional()
  direction?: InteractionDirection;

  @ApiProperty({ example: 'El alumno está interesado en el curso de marketing.' })
  @IsString()
  @IsNotEmpty()
  notes: string;

  @ApiProperty({ description: 'UUID del contacto' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ example: '2025-09-15T10:00:00Z' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: Date;

  @ApiPropertyOptional({ example: 30 })
  @IsInt()
  @IsPositive()
  @IsOptional()
  durationMinutes?: number;
}
