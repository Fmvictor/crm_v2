import { IsBoolean } from 'class-validator';

export class BotPauseDto {
  @IsBoolean()
  paused: boolean;
}
