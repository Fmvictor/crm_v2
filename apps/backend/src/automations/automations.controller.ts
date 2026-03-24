import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
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
}
