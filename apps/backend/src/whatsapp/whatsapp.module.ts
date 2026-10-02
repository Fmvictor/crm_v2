import { forwardRef, Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotJob } from './entities/bot-job.entity';
import { BotJobsService } from './bot-jobs.service';
import { BotInstruction } from './entities/bot-instruction.entity';
import { BotLearning } from './entities/bot-learning.entity';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    ContactsModule,
    InteractionsModule,
    forwardRef(() => ConversationsModule),
    TypeOrmModule.forFeature([BotJob, BotInstruction, BotLearning]),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, BotJobsService],
  exports: [WhatsAppService, BotJobsService],
})
export class WhatsAppModule {}
