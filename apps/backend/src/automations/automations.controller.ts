import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  findAll() {
    return this.automationsService.findAll();
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.automationsService.toggle(id);
  }

  @Patch(':id/template')
  updateTemplate(
    @Param('id') id: string,
    @Body('templateName') templateName: string,
  ) {
    return this.automationsService.updateTemplate(id, templateName);
  }
}
