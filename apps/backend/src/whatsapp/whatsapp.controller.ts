import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ConversationMessageActor } from '../conversations/entities/conversation-message.entity';

type AuthenticatedRequest = Request & { user: User };

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @UseGuards(JwtAuthGuard)
  @Get('templates')
  getTemplates() {
    return this.whatsAppService.getTemplates();
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-template')
  sendTemplate(@Req() request: AuthenticatedRequest, @Body() body: any) {
    this.assertCanSend(request.user);
    return this.whatsAppService.sendTemplate(
      body,
      ConversationMessageActor.AGENT,
      request.user.id,
    );
  }

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.whatsAppService.verifyWebhook(mode, token, challenge);
  }

  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.whatsAppService.verifyWebhookSignature(request.rawBody, signature);
    await this.whatsAppService.handleWebhook(body);
    return { received: true };
  }

  private assertCanSend(user: User) {
    if (user.role === UserRole.VIEWER)
      throw new ForbiddenException('No tienes permiso para enviar mensajes');
  }
}
