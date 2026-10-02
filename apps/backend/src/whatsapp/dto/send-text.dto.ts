import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendTextDto {
  @ApiProperty({ example: '+34600123456' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ example: 'Hola, ¿en qué podemos ayudarte?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text: string;
}
