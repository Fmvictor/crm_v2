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
import { EnrollmentsService } from './enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { FilterEnrollmentDto } from './dto/filter-enrollment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('enrollments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Inscribir un contacto a un curso' })
  create(
    @Body() dto: CreateEnrollmentDto,
    @Request() req: { user: any },
  ) {
    return this.enrollmentsService.create(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar inscripciones con filtros y paginación' })
  findAll(@Query() filter: FilterEnrollmentDto) {
    return this.enrollmentsService.findAll(filter);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas de inscripciones (por estado y pago)' })
  getStats(@Query('courseId') courseId?: string) {
    return this.enrollmentsService.getStats(courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener inscripción por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar inscripción (estado, pago, notas)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    return this.enrollmentsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar inscripción (solo pending/confirmed)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentsService.remove(id);
  }
}
