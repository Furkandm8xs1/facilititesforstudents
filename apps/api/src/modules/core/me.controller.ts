import { Controller, Get, Req } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import { UserProfileRepository } from './user-profile.repository';

@Controller('me')
export class MeController {
  constructor(private readonly userProfiles: UserProfileRepository) {}

  @Get()
  async getCurrentUser(@Req() request: AuthenticatedRequest) {
    const profile = await this.userProfiles.findByKeycloakSubject(
      request.user.subject,
    );

    return {
      identity: request.user,
      profile,
    };
  }
}
