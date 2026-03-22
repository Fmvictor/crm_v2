import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { FilterCourseDto } from './dto/filter-course.dto';
import { PaginatedResult } from '../contacts/contacts.service';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
  ) {}

  create(dto: CreateCourseDto): Promise<Course> {
    return this.coursesRepo.save(this.coursesRepo.create(dto));
  }

  async findAll(filter: FilterCourseDto): Promise<PaginatedResult<Course>> {
    const { status, modality, category, search, page = 1, limit = 20 } = filter;
    const where: any = {};
    if (status) where.status = status;
    if (modality) where.modality = modality;
    if (category) where.category = ILike(`%${category}%`);

    const baseConditions = search
      ? [
          { ...where, name: ILike(`%${search}%`) },
          { ...where, description: ILike(`%${search}%`) },
        ]
      : [where];

    const [data, total] = await this.coursesRepo.findAndCount({
      where: baseConditions,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Course> {
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException(`Curso ${id} no encontrado`);
    return course;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id);
    Object.assign(course, dto);
    return this.coursesRepo.save(course);
  }

  async remove(id: string): Promise<void> {
    const course = await this.findOne(id);
    await this.coursesRepo.softRemove(course);
  }
}
