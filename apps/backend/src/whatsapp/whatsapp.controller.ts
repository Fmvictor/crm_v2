import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { User, UserRole } from '../users/entities/user.entity';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendTemplateDto } from './dto/send-template.dto';
import { SendTextDto } from './dto/send-text.dto';
import { BotPauseDto } from './dto/bot-pause.dto';
import { BotInstructionsDto } from './dto/bot-instructions.dto';
import { BotLearningReviewDto } from './dto/bot-learning-review.dto';
import { BotMemoryDto } from './dto/bot-memory.dto';
import { BotGlobalPauseDto } from './dto/bot-global-pause.dto';
import { BotJobsService } from './bot-jobs.service';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly botJobsService: BotJobsService,
  ) {}

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
  sendTemplate(
    @Body() dto: SendTemplateDto,
    @Req() request: Request & { user: User },
  ) {
    this.assertCanRespond(request.user);
    return this.whatsAppService.sendTemplate(dto, request.user.id);
  }

  @Post('send-text')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enviar un mensaje de texto de WhatsApp' })
  sendText(@Body() dto: SendTextDto, @Req() request: Request & { user: User }) {
    this.assertCanRespond(request.user);
    return this.whatsAppService.sendText(
      dto.to,
      dto.text,
      undefined,
      request.user.id,
    );
  }

  @Patch('contacts/:id/bot')
  @UseGuards(JwtAuthGuard)
  setBotPaused(
    @Param('id') id: string,
    @Body() dto: BotPauseDto,
    @Req() request: Request & { user: User },
  ) {
    this.assertCanRespond(request.user);
    return this.whatsAppService.setBotPaused(id, dto.paused);
  }

  @Patch('contacts/:id/bot-memory')
  @UseGuards(JwtAuthGuard)
  setBotMemory(
    @Param('id') id: string,
    @Body() dto: BotMemoryDto,
    @Req() request: Request & { user: User },
  ) {
    this.assertCanRespond(request.user);
    return this.whatsAppService.setBotMemory(id, dto.memory ?? null);
  }

  @Get('contacts/:id/bot-jobs')
  @UseGuards(JwtAuthGuard)
  listBotJobs(@Param('id') id: string) {
    return this.botJobsService.listForContact(id);
  }

  @Get('bot/attention')
  @UseGuards(JwtAuthGuard)
  listBotAttention() {
    return this.botJobsService.listAttention();
  }

  @Get('bot/instructions')
  @UseGuards(JwtAuthGuard)
  getBotInstructions(@Req() request: Request & { user: User }) {
    this.assertAdmin(request.user);
    return this.botJobsService.getLatestInstruction();
  }

  @Get('bot/config')
  @UseGuards(JwtAuthGuard)
  async getBotConfig() {
    const mode = process.env.BOT_MODE;
    return {
      mode: mode === 'draft' || mode === 'auto' ? mode : 'off',
      paused: await this.botJobsService.isGloballyPaused(),
    };
  }

  @Patch('bot/config')
  @UseGuards(JwtAuthGuard)
  async setBotConfig(
    @Body() dto: BotGlobalPauseDto,
    @Req() request: Request & { user: User },
  ) {
    this.assertAdmin(request.user);
    await this.botJobsService.setGlobalPaused(dto.paused, request.user.id);
    return this.getBotConfig();
  }

  @Put('bot/instructions')
  @UseGuards(JwtAuthGuard)
  saveBotInstructions(
    @Body() dto: BotInstructionsDto,
    @Req() request: Request & { user: User },
  ) {
    this.assertAdmin(request.user);
    return this.botJobsService.replaceInstructions(dto.text, request.user.id);
  }

  @Get('bot/learnings')
  @UseGuards(JwtAuthGuard)
  listBotLearnings(@Req() request: Request & { user: User }) {
    this.assertAdmin(request.user);
    return this.botJobsService.listLearnings();
  }

  @Patch('bot/learnings/:id')
  @UseGuards(JwtAuthGuard)
  reviewBotLearning(
    @Param('id') id: string,
    @Body() dto: BotLearningReviewDto,
    @Req() request: Request & { user: User },
  ) {
    this.assertAdmin(request.user);
    return this.botJobsService.reviewLearning(
      id,
      dto.status,
      dto.category,
      dto.approvedText,
      request.user.id,
    );
  }

  private assertCanRespond(user: User): void {
    if (user.role === UserRole.VIEWER) {
      throw new ForbiddenException(
        'El usuario no puede responder conversaciones',
      );
    }
  }

  private assertAdmin(user: User): void {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo un administrador puede configurar el bot',
      );
    }
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
  handleWebhook(
    @Body() body: unknown,
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    this.whatsAppService.verifyWebhookSignature(request.rawBody, signature);
    return this.whatsAppService.handleWebhook(body);
  }
}
