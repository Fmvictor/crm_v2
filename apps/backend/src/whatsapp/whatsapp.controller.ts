import { Controller, Get, Post, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
  sendTemplate(@Body() body: any) {
    return this.whatsAppService.sendTemplate(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-text')
  sendText(@Body() body: { to: string; text: string }) {
    return this.whatsAppService.sendText(body.to, body.text);
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
  handleWebhook(@Body() body: any) {
    return this.whatsAppService.handleWebhook(body);
  }
}
