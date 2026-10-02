import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendTemplateDto } from './dto/send-template.dto';
import { SendTextDto } from './dto/send-text.dto';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get('templates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar plantillas aprobadas de WhatsApp' })
  getTemplates() {
    return this.whatsAppService.getTemplates();
  }

  @Post('send-template')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enviar una plantilla de WhatsApp' })
  sendTemplate(@Body() dto: SendTemplateDto) {
    return this.whatsAppService.sendTemplate(dto);
  }

  @Post('send-text')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enviar un mensaje de texto de WhatsApp' })
  sendText(@Body() dto: SendTextDto) {
    return this.whatsAppService.sendText(dto.to, dto.text);
  }

  @Get('webhook')
  @ApiOperation({ summary: 'Verificar el webhook de Meta' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.whatsAppService.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recibir mensajes de WhatsApp desde Meta' })
  handleWebhook(@Body() body: unknown) {
    return this.whatsAppService.handleWebhook(body);
  }
}
