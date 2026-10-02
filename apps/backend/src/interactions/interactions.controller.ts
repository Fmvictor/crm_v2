import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InteractionsService } from './interactions.service';
import { FilterInteractionDto } from './dto/filter-interaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('interactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar mensajes de WhatsApp' })
  findAll(@Query() filter: FilterInteractionDto) {
    return this.interactionsService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener interacción por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.interactionsService.findOne(id);
  }
}
