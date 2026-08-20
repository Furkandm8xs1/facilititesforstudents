import { Injectable } from '@nestjs/common';

import { PostgresService } from '../../database/postgres.service';
import type { CreateUserInput } from './admin/create-user.input';

export interface UserProfile {
  id: string;
  keycloak_subject: string;
  phone_e164: string;
  first_name: string;
  last_name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEPARTED';
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UserProfileRepository {
  constructor(private readonly postgres: PostgresService) {}

  async create(
    keycloakSubject: string,
    input: CreateUserInput,
  ): Promise<UserProfile> {
    const result = await this.postgres.query<UserProfile>(
      `INSERT INTO core.user_profile (
        keycloak_subject,
        phone_e164,
        first_name,
        last_name,
        status
      ) VALUES ($1, $2, $3, $4, 'ACTIVE')
      RETURNING
        id,
        keycloak_subject,
        phone_e164,
        first_name,
        last_name,
        status,
        created_at,
        updated_at`,
      [keycloakSubject, input.phoneE164, input.firstName, input.lastName],
    );

    return result.rows[0];
  }

  async findByKeycloakSubject(subject: string): Promise<UserProfile | null> {
    const result = await this.postgres.query<UserProfile>(
      `SELECT
        id,
        keycloak_subject,
        phone_e164,
        first_name,
        last_name,
        status,
        created_at,
        updated_at
      FROM core.user_profile
      WHERE keycloak_subject = $1`,
      [subject],
    );

    return result.rows[0] ?? null;
  }
}
