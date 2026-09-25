import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PostgresService } from '../../database/postgres.service';
import type { BeverageType } from './tea-cafe.input';
import { TeaCafeRuleError } from './tea-cafe.errors';

export interface TeaCafeBrewView {
  id: string;
  beverageType: BeverageType;
  note: string | null;
  durationMinutes: number;
  startedAt: Date;
  readyAt: Date;
  preparedBy: string;
}

interface BrewRow {
  id: string;
  beverage_type: BeverageType;
  note: string | null;
  duration_minutes: number;
  started_at: Date;
  ready_at: Date;
  prepared_by: string;
}

interface IdRow {
  id: string;
}

function brewView(row: BrewRow): TeaCafeBrewView {
  return {
    id: row.id,
    beverageType: row.beverage_type,
    note: row.note,
    durationMinutes: row.duration_minutes,
    startedAt: row.started_at,
    readyAt: row.ready_at,
    preparedBy: row.prepared_by,
  };
}

@Injectable()
export class TeaCafeRepository {
  constructor(private readonly postgres: PostgresService) {}

  async listVisibleBrews(): Promise<TeaCafeBrewView[]> {
    const result = await this.postgres.query<BrewRow>(
      `${this.brewSelect()}
      WHERE service.code = 'tea-cafe-main'
        AND service.active
        AND brew.deleted_at IS NULL
      ORDER BY
        (brew.ready_at <= now()),
        CASE WHEN brew.ready_at > now() THEN brew.ready_at END,
        CASE WHEN brew.ready_at <= now() THEN brew.ready_at END DESC,
        brew.id`,
    );

    return result.rows.map(brewView);
  }

  async deleteExpiredBrews(): Promise<void> {
    await this.postgres.query(
      `DELETE FROM tea_cafe.brew
      WHERE deleted_at IS NULL
        AND started_at <= now() - INTERVAL '10 hours'`,
    );
  }

  async createBrew(input: {
    actorSubject: string;
    beverageType: BeverageType;
    durationMinutes: number;
    note: string | null;
  }): Promise<TeaCafeBrewView> {
    return this.postgres.withTransaction(async (client) => {
      const [actor, serviceUnit] = await Promise.all([
        this.findActiveActor(client, input.actorSubject),
        this.findActiveServiceUnit(client),
      ]);
      const result = await client.query<BrewRow>(
        `INSERT INTO tea_cafe.brew AS brew (
          service_unit_id,
          beverage_type,
          note,
          duration_minutes,
          ready_at,
          created_by_user_profile_id
        ) VALUES ($1, $2, $3, $4, now() + make_interval(mins => $4), $5)
        RETURNING
          brew.id,
          brew.beverage_type,
          brew.note,
          brew.duration_minutes,
          brew.started_at,
          brew.ready_at,
          $6::text AS prepared_by`,
        [
          serviceUnit.id,
          input.beverageType,
          input.note,
          input.durationMinutes,
          actor.id,
          actor.name,
        ],
      );

      return brewView(result.rows[0]);
    });
  }

  async deleteBrew(input: {
    actorSubject: string;
    brewId: string;
  }): Promise<void> {
    await this.postgres.withTransaction(async (client) => {
      const actor = await this.findActiveActor(client, input.actorSubject);
      const result = await client.query<IdRow>(
        `UPDATE tea_cafe.brew AS brew
        SET deleted_at = now(),
            deleted_by_user_profile_id = $2
        FROM core.service_unit AS service
        WHERE brew.id = $1
          AND brew.service_unit_id = service.id
          AND service.code = 'tea-cafe-main'
          AND brew.deleted_at IS NULL
        RETURNING brew.id`,
        [input.brewId, actor.id],
      );

      if (!result.rows[0]) {
        throw new TeaCafeRuleError('BREW_NOT_FOUND');
      }
    });
  }

  private async findActiveActor(client: PoolClient, subject: string) {
    const result = await client.query<{ id: string; name: string }>(
      `SELECT id, concat_ws(' ', first_name, last_name) AS name
      FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );

    if (!result.rows[0]) {
      throw new TeaCafeRuleError('ACTOR_PROFILE_NOT_FOUND');
    }

    return result.rows[0];
  }

  private async findActiveServiceUnit(client: PoolClient) {
    const result = await client.query<IdRow>(
      `SELECT id
      FROM core.service_unit
      WHERE code = 'tea-cafe-main' AND active`,
    );

    if (!result.rows[0]) {
      throw new TeaCafeRuleError('SERVICE_UNIT_NOT_FOUND');
    }

    return result.rows[0];
  }

  private brewSelect() {
    return `SELECT
      brew.id,
      brew.beverage_type,
      brew.note,
      brew.duration_minutes,
      brew.started_at,
      brew.ready_at,
      concat_ws(' ', creator.first_name, creator.last_name) AS prepared_by
    FROM tea_cafe.brew AS brew
    JOIN core.service_unit AS service ON service.id = brew.service_unit_id
    JOIN core.user_profile AS creator
      ON creator.id = brew.created_by_user_profile_id`;
  }
}
