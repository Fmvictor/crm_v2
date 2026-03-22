import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateInteractionDto } from './create-interaction.dto';

// contactId no se puede cambiar una vez creada la interacción
export class UpdateInteractionDto extends PartialType(
  OmitType(CreateInteractionDto, ['contactId'] as const),
) {}
