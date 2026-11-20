import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  courseInputSchema,
  semesterInputSchema,
  timetableImportSchema,
  type Course,
  type TimetableImportResult,
  type Semester,
  type SemesterInput,
  type TimetableData,
} from '@gduthelp/shared';
import { z } from 'zod';
import { AdminOnly, CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { TimetableService } from './timetable.service.js';

type CourseData = z.output<typeof courseInputSchema>;
const idParam = z.uuid();

@Controller()
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  /** 当前学期 + 本人课程；某天有哪些课由前端用 shared 里的 sessionsOn 计算，离线也能用 */
  @Get('timetable')
  data(@CurrentUser() user: AuthUser): Promise<TimetableData> {
    return this.timetable.data(user.id);
  }

  @Post('courses')
  create(@CurrentUser() user: AuthUser, @Body({ schema: courseInputSchema }) body: CourseData): Promise<Course> {
    return this.timetable.create(user.id, body);
  }

  /** 导入教务系统课表（前端解析、预览确认后提交） */
  @Post('timetable/import')
  @HttpCode(200)
  importCourses(
    @CurrentUser() user: AuthUser,
    @Body({ schema: timetableImportSchema }) body: z.output<typeof timetableImportSchema>,
  ): Promise<TimetableImportResult> {
    return this.timetable.importCourses(user.id, body);
  }

  @Put('courses/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: courseInputSchema }) body: CourseData,
  ): Promise<Course> {
    return this.timetable.update(user.id, id, body);
  }

  @Delete('courses/:id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.timetable.remove(user.id, id);
    return null;
  }

  @Put('admin/semesters/current')
  @AdminOnly()
  setSemester(@Body({ schema: semesterInputSchema }) body: SemesterInput): Promise<Semester> {
    return this.timetable.setCurrentSemester(body);
  }
}
