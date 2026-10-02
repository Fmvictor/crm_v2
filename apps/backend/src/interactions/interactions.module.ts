import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Interaction } from './entities/interaction.entity';
import { InteractionsService } from './interactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Interaction])],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
