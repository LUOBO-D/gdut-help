import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateProfileSchema, type UpdateProfileRequest, type UserProfile } from '@gduthelp/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body({ schema: updateProfileSchema }) body: UpdateProfileRequest): Promise<UserProfile> {
    return this.users.updateProfile(user.id, body);
  }
}
