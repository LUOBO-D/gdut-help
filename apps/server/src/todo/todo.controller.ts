import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { todoInputSchema, type Todo, type TodoCompleteResult } from '@gduthelp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { TodoService } from './todo.service.js';

type TodoData = z.output<typeof todoInputSchema>;
const idParam = z.uuid();

@Controller('todos')
export class TodoController {
  constructor(private readonly todos: TodoService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Todo[]> {
    return this.todos.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body({ schema: todoInputSchema }) body: TodoData): Promise<Todo> {
    return this.todos.create(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: todoInputSchema }) body: TodoData,
  ): Promise<Todo> {
    return this.todos.update(user.id, id, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<TodoCompleteResult> {
    return this.todos.setCompleted(user.id, id, true);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<TodoCompleteResult> {
    return this.todos.setCompleted(user.id, id, false);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: idParam }) id: string): Promise<null> {
    await this.todos.remove(user.id, id);
    return null;
  }
}
