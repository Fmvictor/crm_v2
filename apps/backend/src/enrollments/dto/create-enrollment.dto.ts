import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { EnrollmentStatus, PaymentStatus } from '../entities/enrollment.entity';

export class CreateEnrollmentDto {
  @ApiProperty({ description: 'UUID del contacto' })
  @IsUUID()
  @IsNotEmpty()
  contactId: string;

  @ApiProperty({ description: 'UUID del curso' })
  @IsUUID()
  @IsNotEmpty()
  courseId: string;

  @ApiPropertyOptional({ enum: EnrollmentStatus, default: EnrollmentStatus.PENDING })
  @IsEnum(EnrollmentStatus)
  @IsOptional()
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ example: 1500.00, description: 'Monto pagado hasta ahora' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amountPaid?: number;

  @ApiPropertyOptional({ example: 2999.99, description: 'Precio total acordado' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amountTotal?: number;

  @ApiPropertyOptional({ example: '2025-09-01T09:00:00Z' })
  @IsDateString()
  @IsOptional()
  enrolledAt?: Date;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
