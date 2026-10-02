import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from '../conversations/conversations.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { KnowledgeDocument } from '../knowledge/entities/knowledge-document.entity';
import { OpenAiService } from './openai.service';
import { WebKnowledgeService } from './web-knowledge.service';
import { AiConversationProcessor } from './ai-conversation.processor';
import { AiQueueService } from './ai-queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeDocument]), ConversationsModule, forwardRef(() => WhatsAppModule)],
  providers: [OpenAiService, WebKnowledgeService, AiConversationProcessor, AiQueueService],
  exports: [AiQueueService],
})
export class AiModule {}
