import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PostgresService } from '../../database/postgres.service';
import { CanteenRuleError } from './canteen.errors';

export interface CanteenStoreView {
  id: string;
  code: string;
  name: string;
  orderingEnabled: boolean;
}

export interface CanteenProductView {
  id: string;
  name: string;
  priceMinor: string;
  stockOnHand: string;
  stockReserved: string;
  availableStock: string;
  listed: boolean;
  customerVisible: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanteenCatalogView {
  canteen: CanteenStoreView;
  products: CanteenProductView[];
}

interface StoreRow {
  id: string;
  code: string;
  name: string;
  ordering_enabled: boolean;
}

interface ProductRow {
  id: string;
  canteen_id: string;
  name: string;
  name_key: string;
  price_minor: string;
  stock_on_hand: string;
  stock_reserved: string;
  available_stock: string;
  listed: boolean;
  customer_visible: boolean;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ActorRow {
  id: string;
}

interface ProductSnapshot {
  name: string;
  priceMinor: string;
  stockOnHand: string;
  stockReserved: string;
  listed: boolean;
  archived: boolean;
}

function storeView(row: StoreRow): CanteenStoreView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    orderingEnabled: row.ordering_enabled,
  };
}

function productView(row: ProductRow): CanteenProductView {
  return {
    id: row.id,
    name: row.name,
    priceMinor: row.price_minor,
    stockOnHand: row.stock_on_hand,
    stockReserved: row.stock_reserved,
    availableStock: row.available_stock,
    listed: row.listed,
    customerVisible: row.customer_visible,
    archived: row.archived_at !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function snapshot(row: ProductRow): ProductSnapshot {
  return {
    name: row.name,
    priceMinor: row.price_minor,
    stockOnHand: row.stock_on_hand,
    stockReserved: row.stock_reserved,
    listed: row.listed,
    archived: row.archived_at !== null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

@Injectable()
export class CanteenRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getCustomerCatalog(): Promise<CanteenCatalogView> {
    const canteen = await this.findMainStore();

    if (!canteen) {
      throw new CanteenRuleError('MAIN_CANTEEN_NOT_FOUND');
    }

    const products = await this.postgres.query<ProductRow>(
      `${this.productSelect()}
      WHERE product.canteen_id = $1
        AND product.archived_at IS NULL
        AND product.listed
        AND product.stock_on_hand > product.stock_reserved
      ORDER BY product.name`,
      [canteen.id],
    );

    return {
      canteen,
      products: products.rows.map(productView),
    };
  }

  async getManagementCatalog(): Promise<CanteenCatalogView> {
    const canteen = await this.findMainStore();

    if (!canteen) {
      throw new CanteenRuleError('MAIN_CANTEEN_NOT_FOUND');
    }

    const products = await this.postgres.query<ProductRow>(
      `${this.productSelect()}
      WHERE product.canteen_id = $1
      ORDER BY product.archived_at NULLS FIRST, product.name`,
      [canteen.id],
    );

    return {
      canteen,
      products: products.rows.map(productView),
    };
  }

  async createOrUpdateProduct(input: {
    actorSubject: string;
    name: string;
    nameKey: string;
    priceMinor: bigint;
    stockOnHand: bigint;
  }): Promise<CanteenProductView> {
    try {
      return await this.postgres.withTransaction(async (client) => {
        const actor = await this.findActor(client, input.actorSubject);
        const canteen = await this.findMainStore(client);

        if (!canteen) {
          throw new CanteenRuleError('MAIN_CANTEEN_NOT_FOUND');
        }

        await client.query(
          `SELECT pg_advisory_xact_lock(
            hashtextextended($1 || ':' || $2, 0)
          )`,
          [canteen.id, input.nameKey],
        );

        const existing = await this.lockProductByName(
          client,
          canteen.id,
          input.nameKey,
        );

        if (existing) {
          if (input.stockOnHand < BigInt(existing.stock_reserved)) {
            throw new CanteenRuleError('STOCK_BELOW_RESERVED');
          }

          const updated = await client.query<ProductRow>(
            `${this.productUpdateReturning()}
            SET name = $2,
                name_key = $3,
                price_minor = $4,
                stock_on_hand = $5,
                listed = $5::bigint > 0,
                archived_at = NULL,
                updated_at = now()
            WHERE product.id = $1
            ${this.productReturning()}`,
            [
              existing.id,
              input.name,
              input.nameKey,
              input.priceMinor.toString(),
              input.stockOnHand.toString(),
            ],
          );
          const product = updated.rows[0];

          await this.recordEvent(
            client,
            product.id,
            existing.archived_at ? 'REACTIVATED' : 'UPDATED',
            actor.id,
            snapshot(existing),
            snapshot(product),
          );

          return productView(product);
        }

        const inserted = await client.query<ProductRow>(
          `${this.productInsertReturning()}
          VALUES ($1, $2, $3, $4, $5::bigint, $5::bigint > 0)
          ${this.productReturning()}`,
          [
            canteen.id,
            input.name,
            input.nameKey,
            input.priceMinor.toString(),
            input.stockOnHand.toString(),
          ],
        );
        const product = inserted.rows[0];

        await this.recordEvent(
          client,
          product.id,
          'CREATED',
          actor.id,
          null,
          snapshot(product),
        );

        return productView(product);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CanteenRuleError('PRODUCT_NAME_CONFLICT');
      }
      throw error;
    }
  }

  async updateProductDetails(input: {
    actorSubject: string;
    productId: string;
    name: string;
    nameKey: string;
    priceMinor: bigint;
  }): Promise<CanteenProductView> {
    return this.changeProduct(
      input.actorSubject,
      input.productId,
      async (client, actor, existing) => {
        try {
          const updated = await client.query<ProductRow>(
            `${this.productUpdateReturning()}
          SET name = $2,
              name_key = $3,
              price_minor = $4,
              updated_at = now()
          WHERE product.id = $1
          ${this.productReturning()}`,
            [
              existing.id,
              input.name,
              input.nameKey,
              input.priceMinor.toString(),
            ],
          );
          const product = updated.rows[0];

          await this.recordEvent(
            client,
            product.id,
            'UPDATED',
            actor.id,
            snapshot(existing),
            snapshot(product),
          );
          return product;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new CanteenRuleError('PRODUCT_NAME_CONFLICT');
          }
          throw error;
        }
      },
    );
  }

  async setProductStock(input: {
    actorSubject: string;
    productId: string;
    stockOnHand: bigint;
  }): Promise<CanteenProductView> {
    return this.changeProduct(
      input.actorSubject,
      input.productId,
      async (client, actor, existing) => {
        if (input.stockOnHand < BigInt(existing.stock_reserved)) {
          throw new CanteenRuleError('STOCK_BELOW_RESERVED');
        }

        const updated = await client.query<ProductRow>(
          `${this.productUpdateReturning()}
        SET stock_on_hand = $2,
            updated_at = now()
        WHERE product.id = $1
        ${this.productReturning()}`,
          [existing.id, input.stockOnHand.toString()],
        );
        const product = updated.rows[0];

        await this.recordEvent(
          client,
          product.id,
          'STOCK_SET',
          actor.id,
          snapshot(existing),
          snapshot(product),
        );
        return product;
      },
    );
  }

  async setProductVisibility(input: {
    actorSubject: string;
    productId: string;
    listed: boolean;
  }): Promise<CanteenProductView> {
    return this.changeProduct(
      input.actorSubject,
      input.productId,
      async (client, actor, existing) => {
        if (existing.archived_at && input.listed) {
          throw new CanteenRuleError('PRODUCT_ARCHIVED');
        }

        if (existing.listed === input.listed) {
          return existing;
        }

        const updated = await client.query<ProductRow>(
          `${this.productUpdateReturning()}
        SET listed = $2,
            updated_at = now()
        WHERE product.id = $1
        ${this.productReturning()}`,
          [existing.id, input.listed],
        );
        const product = updated.rows[0];

        await this.recordEvent(
          client,
          product.id,
          input.listed ? 'LISTED' : 'UNLISTED',
          actor.id,
          snapshot(existing),
          snapshot(product),
        );
        return product;
      },
    );
  }

  async archiveProduct(input: {
    actorSubject: string;
    productId: string;
  }): Promise<CanteenProductView> {
    return this.changeProduct(
      input.actorSubject,
      input.productId,
      async (client, actor, existing) => {
        if (existing.archived_at) {
          return existing;
        }

        if (BigInt(existing.stock_reserved) > 0n) {
          throw new CanteenRuleError('PRODUCT_HAS_RESERVATIONS');
        }

        const updated = await client.query<ProductRow>(
          `${this.productUpdateReturning()}
        SET listed = false,
            archived_at = now(),
            updated_at = now()
        WHERE product.id = $1
        ${this.productReturning()}`,
          [existing.id],
        );
        const product = updated.rows[0];

        await this.recordEvent(
          client,
          product.id,
          'ARCHIVED',
          actor.id,
          snapshot(existing),
          snapshot(product),
        );
        return product;
      },
    );
  }

  private async changeProduct(
    actorSubject: string,
    productId: string,
    change: (
      client: PoolClient,
      actor: ActorRow,
      existing: ProductRow,
    ) => Promise<ProductRow>,
  ) {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, actorSubject);
      const existing = await this.lockMainProduct(client, productId);

      if (!existing) {
        throw new CanteenRuleError('PRODUCT_NOT_FOUND');
      }

      return productView(await change(client, actor, existing));
    });
  }

  private async findActor(client: PoolClient, subject: string) {
    const result = await client.query<ActorRow>(
      `SELECT id
      FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );

    if (!result.rows[0]) {
      throw new CanteenRuleError('ACTOR_PROFILE_NOT_FOUND');
    }

    return result.rows[0];
  }

  private async findMainStore(client?: PoolClient) {
    const query = `SELECT
        store.id,
        service.code,
        service.name,
        store.ordering_enabled
      FROM canteen.store AS store
      JOIN core.service_unit AS service ON service.id = store.service_unit_id
      WHERE service.code = 'canteen-main'
        AND store.customer_visible
        AND service.active`;
    const result = client
      ? await client.query<StoreRow>(query)
      : await this.postgres.query<StoreRow>(query);

    return result.rows[0] ? storeView(result.rows[0]) : null;
  }

  private async lockProductByName(
    client: PoolClient,
    canteenId: string,
    nameKey: string,
  ) {
    const result = await client.query<ProductRow>(
      `${this.productSelect()}
      WHERE product.canteen_id = $1 AND product.name_key = $2
      FOR UPDATE OF product`,
      [canteenId, nameKey],
    );

    return result.rows[0] ?? null;
  }

  private async lockMainProduct(client: PoolClient, productId: string) {
    const result = await client.query<ProductRow>(
      `${this.productSelect()}
      WHERE product.id = $1 AND service.code = 'canteen-main'
      FOR UPDATE OF product`,
      [productId],
    );

    return result.rows[0] ?? null;
  }

  private recordEvent(
    client: PoolClient,
    productId: string,
    eventType: string,
    actorId: string,
    beforeState: ProductSnapshot | null,
    afterState: ProductSnapshot,
  ) {
    return client.query(
      `INSERT INTO canteen.product_event (
        product_id,
        event_type,
        actor_user_profile_id,
        before_state,
        after_state
      ) VALUES ($1, $2, $3, $4, $5)`,
      [productId, eventType, actorId, beforeState, afterState],
    );
  }

  private productSelect() {
    return `SELECT
      product.id,
      product.canteen_id,
      product.name,
      product.name_key,
      product.price_minor::text,
      product.stock_on_hand::text,
      product.stock_reserved::text,
      (product.stock_on_hand - product.stock_reserved)::text AS available_stock,
      product.listed,
      (
        product.archived_at IS NULL
        AND product.listed
        AND product.stock_on_hand > product.stock_reserved
      ) AS customer_visible,
      product.archived_at,
      product.created_at,
      product.updated_at
    FROM canteen.product AS product
    JOIN canteen.store AS store ON store.id = product.canteen_id
    JOIN core.service_unit AS service ON service.id = store.service_unit_id`;
  }

  private productInsertReturning() {
    return `INSERT INTO canteen.product AS product (
      canteen_id,
      name,
      name_key,
      price_minor,
      stock_on_hand,
      listed
    )`;
  }

  private productUpdateReturning() {
    return 'UPDATE canteen.product AS product';
  }

  private productReturning() {
    return `RETURNING
      product.id,
      product.canteen_id,
      product.name,
      product.name_key,
      product.price_minor::text,
      product.stock_on_hand::text,
      product.stock_reserved::text,
      (product.stock_on_hand - product.stock_reserved)::text AS available_stock,
      product.listed,
      (
        product.archived_at IS NULL
        AND product.listed
        AND product.stock_on_hand > product.stock_reserved
      ) AS customer_visible,
      product.archived_at,
      product.created_at,
      product.updated_at`;
  }
}
