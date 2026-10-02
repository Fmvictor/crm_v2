import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendTemplateDto {
  @ApiProperty({ example: '+34600123456' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ example: 'bienvenida' })
  @IsString()
  @IsNotEmpty()
  templateName: string;

  @ApiPropertyOptional({ example: 'es' })
  @IsString()
  @IsOptional()
  languageCode?: string;

  @ApiPropertyOptional({ type: [String], example: ['Carlos'] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  @IsOptional()
  params?: string[];
}
