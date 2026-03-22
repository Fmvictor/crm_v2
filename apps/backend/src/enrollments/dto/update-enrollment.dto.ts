import { PartialType, OmitType } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEnrollmentDto } from './create-enrollment.dto';

export class UpdateEnrollmentDto extends PartialType(
  OmitType(CreateEnrollmentDto, ['contactId', 'courseId'] as const),
) {
  @ApiPropertyOptional({ example: '2025-11-30T18:00:00Z' })
  @IsDateString()
  @IsOptional()
  completedAt?: Date;
}
