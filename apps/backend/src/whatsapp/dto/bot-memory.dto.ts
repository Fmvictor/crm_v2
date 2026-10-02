import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BotMemoryDto {
  @IsString()
  @MaxLength(700)
  @IsOptional()
  memory?: string | null;
}
