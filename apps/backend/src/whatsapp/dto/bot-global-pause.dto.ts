import { IsBoolean } from 'class-validator';

export class BotGlobalPauseDto {
  @IsBoolean()
  paused: boolean;
}
