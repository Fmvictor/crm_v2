import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BotModelService } from './bot-model.service';
import { BotWorkerService } from './bot-worker.service';
import { CourseWebsiteService } from './course-website.service';

@Module({
  imports: [ContactsModule, InteractionsModule, WhatsAppModule],
  providers: [CourseWebsiteService, BotModelService, BotWorkerService],
})
export class AiModule {}
