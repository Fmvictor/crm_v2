import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class BotLearningReviewDto {
  @IsEnum(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @IsEnum(['style', 'process'])
  category: 'style' | 'process';

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  approvedText?: string;
}
