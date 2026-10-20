import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppDispatchService } from './whatsapp-dispatch.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { AiModule } from '../ai/ai.module';
import { WhatsAppStatusService } from './whatsapp-status.service';

@Module({
  imports: [
    forwardRef(() => ContactsModule),
    forwardRef(() => InteractionsModule),
    forwardRef(() => ConversationsModule),
    forwardRef(() => AiModule),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppDispatchService, WhatsAppStatusService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
