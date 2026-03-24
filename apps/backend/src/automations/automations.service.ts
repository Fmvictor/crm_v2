import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Automation,
  AutomationTrigger,
  AutomationAction,
} from './entities/automation.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Contact } from '../contacts/entities/contact.entity';
import { Course } from '../courses/entities/course.entity';

export interface AutomationContext {
  contact: Contact;
  course: Course;
  amountPaid?: number;
  currency?: string;
}

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    @InjectRepository(Automation)
    private readonly automationsRepo: Repository<Automation>,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  findAll(): Promise<Automation[]> {
    return this.automationsRepo.find({ order: { createdAt: 'ASC' } });
  }

  async toggle(id: string): Promise<Automation> {
    const automation = await this.automationsRepo.findOne({ where: { id } });
    if (!automation) throw new NotFoundException(`Automatización ${id} no encontrada`);
    automation.isActive = !automation.isActive;
    return this.automationsRepo.save(automation);
  }

  async updateTemplate(id: string, templateName: string): Promise<Automation> {
    const automation = await this.automationsRepo.findOne({ where: { id } });
    if (!automation) throw new NotFoundException(`Automatización ${id} no encontrada`);
    automation.templateName = templateName;
    return this.automationsRepo.save(automation);
  }

  async executeForTrigger(
    trigger: AutomationTrigger,
    ctx: AutomationContext,
  ): Promise<void> {
    const automations = await this.automationsRepo.find({
      where: { trigger, isActive: true },
    });

    for (const automation of automations) {
      try {
        await this.execute(automation, ctx);
      } catch (err) {
        this.logger.error(
          `Error ejecutando automatización "${automation.name}": ${err.message}`,
        );
      }
    }
  }

  private async execute(
    automation: Automation,
    ctx: AutomationContext,
  ): Promise<void> {
    if (automation.action === AutomationAction.WHATSAPP_TEMPLATE) {
      const phone = ctx.contact.phone;
      if (!phone) {
        this.logger.warn(
          `Automatización "${automation.name}": contacto ${ctx.contact.id} sin teléfono, omitiendo`,
        );
        return;
      }

      await this.whatsAppService.sendTemplate({
        to: phone,
        templateName: automation.templateName ?? '',
        params: [ctx.contact.name, ctx.course.name],
      });

      this.logger.log(
        `Automatización "${automation.name}" ejecutada para ${ctx.contact.name}`,
      );
    }
  }
}
