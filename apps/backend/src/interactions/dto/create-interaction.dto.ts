import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  InteractionDirection,
  InteractionType,
} from '../entities/interaction.entity';

export class CreateInteractionDto {
  @ApiProperty({ enum: InteractionType, default: InteractionType.WHATSAPP })
  @IsEnum(InteractionType)
  @IsOptional()
  type?: InteractionType;

  @ApiPropertyOptional({ enum: InteractionDirection })
  @IsEnum(InteractionDirection)
  @IsOptional()
  direction?: InteractionDirection;

  @ApiProperty({
    example: 'El alumno está interesado en el curso de marketing.',
  })
  @IsString()
  @IsNotEmpty()
  notes: string;

  @ApiProperty({ description: 'UUID del contacto' })
  @IsUUID()
  contactId: string;
}
