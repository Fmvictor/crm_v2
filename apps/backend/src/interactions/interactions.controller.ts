import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { UpdateInteractionDto } from './dto/update-interaction.dto';
import { FilterInteractionDto } from './dto/filter-interaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('interactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar interacción con un contacto' })
  create(
    @Body() dto: CreateInteractionDto,
    @Request() req: { user: any },
  ) {
    return this.interactionsService.create(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar interacciones (filtrables por contacto y tipo)' })
  findAll(@Query() filter: FilterInteractionDto) {
    return this.interactionsService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener interacción por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.interactionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar interacción' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInteractionDto,
  ) {
    return this.interactionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar interacción' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.interactionsService.remove(id);
  }
}
