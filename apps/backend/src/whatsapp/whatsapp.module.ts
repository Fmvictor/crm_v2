import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { InteractionsModule } from '../interactions/interactions.module';

@Module({
  imports: [ContactsModule, InteractionsModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
