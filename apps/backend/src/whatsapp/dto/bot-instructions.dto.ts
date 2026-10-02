import { IsString, MaxLength, MinLength } from 'class-validator';

export class BotInstructionsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;
}
