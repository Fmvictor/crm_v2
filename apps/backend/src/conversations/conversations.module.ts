import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../contacts/entities/contact.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { PipelineEvent } from './entities/pipeline-event.entity';
import { KnowledgeDocument } from '../knowledge/entities/knowledge-document.entity';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Conversation, ConversationMessage, PipelineEvent, KnowledgeDocument]),
    forwardRef(() => WhatsAppModule),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
