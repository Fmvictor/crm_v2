import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Automation } from './entities/automation.entity';
import { AutomationsService } from './automations.service';
import { AutomationsController } from './automations.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [TypeOrmModule.forFeature([Automation]), WhatsAppModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
