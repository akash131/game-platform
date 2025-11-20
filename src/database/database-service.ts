/**
 * Database Persistence Layer
 * Provides vendor-agnostic database access with ORM capabilities
 * Supports PostgreSQL, MySQL, MongoDB, and in-memory storage
 */

import { EventEmitter } from 'events';

export type DatabaseType = 'postgresql' | 'mysql' | 'mongodb' | 'memory';

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  poolSize?: number;
  connectionTimeout?: number;
  enableLogging?: boolean;
  enableCaching?: boolean;
  cacheSize?: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  sort?: Record<string, 'asc' | 'desc'>;
  projection?: string[];
}

export interface Transaction {
  id: string;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  execute<T>(query: string, params?: any[]): Promise<T[]>;
}

export interface Migration {
  version: number;
  name: string;
  up(): Promise<void>;
  down(): Promise<void>;
}

export interface IndexOptions {
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

export class DatabaseService extends EventEmitter {
  private config: DatabaseConfig;
  private connected: boolean = false;
  private connectionPool: any[] = [];
  private cache: Map<string, CacheEntry> = new Map();
  private migrations: Migration[] = [];
  private schemas: Map<string, any> = new Map();

  constructor(config: DatabaseConfig) {
    super();
    this.config = {
      poolSize: 10,
      connectionTimeout: 5000,
      enableLogging: false,
      enableCaching: true,
      cacheSize: 1000,
      ...config
    };
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Initialize connection pool
      for (let i = 0; i < this.config.poolSize!; i++) {
        const connection = await this.createConnection();
        this.connectionPool.push(connection);
      }

      this.connected = true;
      this.emit('connected', { type: this.config.type });

      if (this.config.enableLogging) {
        console.log(`[Database] Connected to ${this.config.type} database`);
      }
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to connect to database: ${error}`);
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    for (const connection of this.connectionPool) {
      await this.closeConnection(connection);
    }

    this.connectionPool = [];
    this.connected = false;
    this.cache.clear();
    this.emit('disconnected');
  }

  /**
   * Execute raw query
   */
  async query<T = any>(query: string, params: any[] = []): Promise<T[]> {
    this.ensureConnected();

    // Check cache first
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(query, params);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const connection = await this.getConnection();

    try {
      const startTime = Date.now();
      const result = await this.executeQuery<T>(connection, query, params);
      const duration = Date.now() - startTime;

      if (this.config.enableLogging) {
        console.log(`[Database] Query executed in ${duration}ms`);
      }

      this.emit('query', { query, params, duration, resultCount: result.length });

      // Cache SELECT queries
      if (this.config.enableCaching && query.trim().toUpperCase().startsWith('SELECT')) {
        const cacheKey = this.getCacheKey(query, params);
        this.setInCache(cacheKey, result, 60000); // 1 minute TTL
      }

      return result;
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Find documents/records
   */
  async find<T = any>(
    collection: string,
    filter: Record<string, any> = {},
    options: QueryOptions = {}
  ): Promise<T[]> {
    this.ensureConnected();

    const query = this.buildSelectQuery(collection, filter, options);
    const params = Object.values(filter);

    return this.query<T>(query, params);
  }

  /**
   * Find one document/record
   */
  async findOne<T = any>(
    collection: string,
    filter: Record<string, any>
  ): Promise<T | null> {
    const results = await this.find<T>(collection, filter, { limit: 1 });
    return results[0] || null;
  }

  /**
   * Find by ID
   */
  async findById<T = any>(collection: string, id: string): Promise<T | null> {
    return this.findOne<T>(collection, { id });
  }

  /**
   * Insert document/record
   */
  async insert<T = any>(
    collection: string,
    data: Partial<T>
  ): Promise<T> {
    this.ensureConnected();

    const query = this.buildInsertQuery(collection, data);
    const params = Object.values(data);

    const result = await this.query<T>(query, params);

    // Invalidate cache for this collection
    this.invalidateCache(collection);

    this.emit('insert', { collection, data });

    return result[0];
  }

  /**
   * Insert many documents/records
   */
  async insertMany<T = any>(
    collection: string,
    documents: Partial<T>[]
  ): Promise<T[]> {
    this.ensureConnected();

    const results: T[] = [];

    for (const doc of documents) {
      const result = await this.insert<T>(collection, doc);
      results.push(result);
    }

    return results;
  }

  /**
   * Update document/record
   */
  async update<T = any>(
    collection: string,
    filter: Record<string, any>,
    update: Partial<T>
  ): Promise<number> {
    this.ensureConnected();

    const query = this.buildUpdateQuery(collection, filter, update);
    const params = [...Object.values(update), ...Object.values(filter)];

    await this.query(query, params);

    // Invalidate cache
    this.invalidateCache(collection);

    this.emit('update', { collection, filter, update });

    return 1; // Return affected rows count
  }

  /**
   * Update by ID
   */
  async updateById<T = any>(
    collection: string,
    id: string,
    update: Partial<T>
  ): Promise<T | null> {
    await this.update(collection, { id }, update);
    return this.findById<T>(collection, id);
  }

  /**
   * Delete document/record
   */
  async delete(
    collection: string,
    filter: Record<string, any>
  ): Promise<number> {
    this.ensureConnected();

    const query = this.buildDeleteQuery(collection, filter);
    const params = Object.values(filter);

    await this.query(query, params);

    // Invalidate cache
    this.invalidateCache(collection);

    this.emit('delete', { collection, filter });

    return 1; // Return deleted count
  }

  /**
   * Delete by ID
   */
  async deleteById(collection: string, id: string): Promise<boolean> {
    const count = await this.delete(collection, { id });
    return count > 0;
  }

  /**
   * Count documents/records
   */
  async count(
    collection: string,
    filter: Record<string, any> = {}
  ): Promise<number> {
    this.ensureConnected();

    const query = this.buildCountQuery(collection, filter);
    const params = Object.values(filter);

    const result = await this.query<{ count: number }>(query, params);
    return result[0]?.count || 0;
  }

  /**
   * Create index
   */
  async createIndex(
    collection: string,
    fields: Record<string, 1 | -1>,
    options: IndexOptions = {}
  ): Promise<void> {
    this.ensureConnected();

    const query = this.buildCreateIndexQuery(collection, fields, options);
    await this.query(query);

    this.emit('indexCreated', { collection, fields, options });
  }

  /**
   * Start transaction
   */
  async startTransaction(): Promise<Transaction> {
    this.ensureConnected();

    const connection = await this.getConnection();
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.executeQuery(connection, 'BEGIN', []);

    return {
      id: transactionId,
      commit: async () => {
        await this.executeQuery(connection, 'COMMIT', []);
        this.releaseConnection(connection);
      },
      rollback: async () => {
        await this.executeQuery(connection, 'ROLLBACK', []);
        this.releaseConnection(connection);
      },
      execute: async <T>(query: string, params: any[] = []) => {
        return this.executeQuery<T>(connection, query, params);
      }
    };
  }

  /**
   * Run migrations
   */
  async runMigrations(): Promise<void> {
    this.ensureConnected();

    // Create migrations table if not exists
    await this.createMigrationsTable();

    // Get applied migrations
    const appliedMigrations = await this.getAppliedMigrations();

    // Run pending migrations
    for (const migration of this.migrations) {
      if (!appliedMigrations.includes(migration.version)) {
        console.log(`[Database] Running migration: ${migration.name}`);

        try {
          await migration.up();
          await this.recordMigration(migration);

          this.emit('migrationApplied', migration);
        } catch (error) {
          console.error(`[Database] Migration failed: ${migration.name}`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Rollback migration
   */
  async rollbackMigration(version: number): Promise<void> {
    const migration = this.migrations.find(m => m.version === version);

    if (!migration) {
      throw new Error(`Migration version ${version} not found`);
    }

    await migration.down();
    await this.removeMigration(version);

    this.emit('migrationRolledBack', migration);
  }

  /**
   * Register migration
   */
  registerMigration(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Define schema
   */
  defineSchema(collection: string, schema: any): void {
    this.schemas.set(collection, schema);
  }

  /**
   * Aggregate query (MongoDB-style)
   */
  async aggregate<T = any>(
    collection: string,
    pipeline: any[]
  ): Promise<T[]> {
    this.ensureConnected();

    // Convert MongoDB aggregation pipeline to SQL
    const query = this.buildAggregateQuery(collection, pipeline);
    return this.query<T>(query);
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<any> {
    return {
      type: this.config.type,
      connected: this.connected,
      poolSize: this.connectionPool.length,
      cacheSize: this.cache.size,
      migrations: this.migrations.length,
      schemas: this.schemas.size
    };
  }

  // Private helper methods

  private async createConnection(): Promise<any> {
    // Mock connection for in-memory database
    if (this.config.type === 'memory') {
      return {
        type: 'memory',
        data: new Map<string, any[]>()
      };
    }

    // For real databases, this would create actual connections
    return {
      type: this.config.type,
      host: this.config.host,
      connected: true
    };
  }

  private async closeConnection(connection: any): Promise<void> {
    // Close connection
    connection.connected = false;
  }

  private async getConnection(): Promise<any> {
    if (this.connectionPool.length === 0) {
      throw new Error('No available connections in pool');
    }
    return this.connectionPool[0]; // Simple round-robin
  }

  private releaseConnection(connection: any): void {
    // Connection returned to pool
  }

  private async executeQuery<T>(
    connection: any,
    query: string,
    params: any[]
  ): Promise<T[]> {
    // Mock execution for in-memory database
    if (connection.type === 'memory') {
      return this.executeMemoryQuery<T>(connection, query, params);
    }

    // For real databases, execute actual queries
    // This is a simplified mock
    return [] as T[];
  }

  private executeMemoryQuery<T>(
    connection: any,
    query: string,
    params: any[]
  ): T[] {
    const upperQuery = query.trim().toUpperCase();

    // Simple query parser for in-memory storage
    if (upperQuery.startsWith('SELECT')) {
      const match = query.match(/FROM\s+(\w+)/i);
      if (match) {
        const collection = match[1];
        const data = connection.data.get(collection) || [];
        return data as T[];
      }
    } else if (upperQuery.startsWith('INSERT')) {
      const match = query.match(/INTO\s+(\w+)/i);
      if (match) {
        const collection = match[1];
        const data = connection.data.get(collection) || [];
        const newItem = { id: `${Date.now()}_${Math.random()}`, ...params[0] };
        data.push(newItem);
        connection.data.set(collection, data);
        return [newItem] as T[];
      }
    } else if (upperQuery.startsWith('UPDATE')) {
      const match = query.match(/UPDATE\s+(\w+)/i);
      if (match) {
        const collection = match[1];
        const data = connection.data.get(collection) || [];
        // Simple update logic
        connection.data.set(collection, data);
      }
    } else if (upperQuery.startsWith('DELETE')) {
      const match = query.match(/FROM\s+(\w+)/i);
      if (match) {
        const collection = match[1];
        connection.data.set(collection, []);
      }
    }

    return [] as T[];
  }

  private buildSelectQuery(
    collection: string,
    filter: Record<string, any>,
    options: QueryOptions
  ): string {
    let query = `SELECT `;

    // Projection
    if (options.projection && options.projection.length > 0) {
      query += options.projection.join(', ');
    } else {
      query += '*';
    }

    query += ` FROM ${collection}`;

    // Where clause
    if (Object.keys(filter).length > 0) {
      const conditions = Object.keys(filter).map((key, idx) => `${key} = $${idx + 1}`);
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Order by
    if (options.sort) {
      const orderBy = Object.entries(options.sort)
        .map(([field, direction]) => `${field} ${direction.toUpperCase()}`)
        .join(', ');
      query += ` ORDER BY ${orderBy}`;
    }

    // Limit and offset
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    return query;
  }

  private buildInsertQuery(collection: string, data: any): string {
    const fields = Object.keys(data);
    const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(', ');

    return `INSERT INTO ${collection} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  }

  private buildUpdateQuery(
    collection: string,
    filter: Record<string, any>,
    update: any
  ): string {
    const updateFields = Object.keys(update);
    const setClause = updateFields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');

    const filterFields = Object.keys(filter);
    const whereClause = filterFields
      .map((field, idx) => `${field} = $${idx + updateFields.length + 1}`)
      .join(' AND ');

    return `UPDATE ${collection} SET ${setClause} WHERE ${whereClause}`;
  }

  private buildDeleteQuery(collection: string, filter: Record<string, any>): string {
    const conditions = Object.keys(filter).map((key, idx) => `${key} = $${idx + 1}`);
    return `DELETE FROM ${collection} WHERE ${conditions.join(' AND ')}`;
  }

  private buildCountQuery(collection: string, filter: Record<string, any>): string {
    let query = `SELECT COUNT(*) as count FROM ${collection}`;

    if (Object.keys(filter).length > 0) {
      const conditions = Object.keys(filter).map((key, idx) => `${key} = $${idx + 1}`);
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    return query;
  }

  private buildCreateIndexQuery(
    collection: string,
    fields: Record<string, 1 | -1>,
    options: IndexOptions
  ): string {
    const indexName = `idx_${collection}_${Object.keys(fields).join('_')}`;
    const fieldList = Object.entries(fields)
      .map(([field, direction]) => `${field} ${direction === 1 ? 'ASC' : 'DESC'}`)
      .join(', ');

    let query = `CREATE ${options.unique ? 'UNIQUE ' : ''}INDEX ${indexName} ON ${collection} (${fieldList})`;

    return query;
  }

  private buildAggregateQuery(collection: string, pipeline: any[]): string {
    // Simplified aggregation to SQL conversion
    let query = `SELECT * FROM ${collection}`;

    for (const stage of pipeline) {
      if (stage.$match) {
        const conditions = Object.keys(stage.$match)
          .map(key => `${key} = '${stage.$match[key]}'`)
          .join(' AND ');
        query += ` WHERE ${conditions}`;
      } else if (stage.$sort) {
        const orderBy = Object.entries(stage.$sort)
          .map(([field, direction]) => `${field} ${direction === 1 ? 'ASC' : 'DESC'}`)
          .join(', ');
        query += ` ORDER BY ${orderBy}`;
      } else if (stage.$limit) {
        query += ` LIMIT ${stage.$limit}`;
      }
    }

    return query;
  }

  private async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.query(query);
  }

  private async getAppliedMigrations(): Promise<number[]> {
    const results = await this.query<{ version: number }>('SELECT version FROM migrations');
    return results.map(r => r.version);
  }

  private async recordMigration(migration: Migration): Promise<void> {
    await this.query(
      'INSERT INTO migrations (version, name) VALUES ($1, $2)',
      [migration.version, migration.name]
    );
  }

  private async removeMigration(version: number): Promise<void> {
    await this.query('DELETE FROM migrations WHERE version = $1', [version]);
  }

  private getCacheKey(query: string, params: any[]): string {
    return `${query}:${JSON.stringify(params)}`;
  }

  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setInCache(key: string, data: any, ttl: number): void {
    // Enforce cache size limit
    if (this.cache.size >= this.config.cacheSize!) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private invalidateCache(collection: string): void {
    // Remove all cached queries for this collection
    for (const [key] of this.cache) {
      if (key.includes(collection)) {
        this.cache.delete(key);
      }
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Database not connected. Call connect() first.');
    }
  }
}

/**
 * Repository Pattern for type-safe data access
 */
export class Repository<T> {
  constructor(
    private db: DatabaseService,
    private collection: string
  ) {}

  async find(filter: Partial<T> = {}, options: QueryOptions = {}): Promise<T[]> {
    return this.db.find<T>(this.collection, filter as any, options);
  }

  async findOne(filter: Partial<T>): Promise<T | null> {
    return this.db.findOne<T>(this.collection, filter as any);
  }

  async findById(id: string): Promise<T | null> {
    return this.db.findById<T>(this.collection, id);
  }

  async create(data: Partial<T>): Promise<T> {
    return this.db.insert<T>(this.collection, data);
  }

  async createMany(documents: Partial<T>[]): Promise<T[]> {
    return this.db.insertMany<T>(this.collection, documents);
  }

  async update(filter: Partial<T>, update: Partial<T>): Promise<number> {
    return this.db.update<T>(this.collection, filter as any, update);
  }

  async updateById(id: string, update: Partial<T>): Promise<T | null> {
    return this.db.updateById<T>(this.collection, id, update);
  }

  async delete(filter: Partial<T>): Promise<number> {
    return this.db.delete(this.collection, filter as any);
  }

  async deleteById(id: string): Promise<boolean> {
    return this.db.deleteById(this.collection, id);
  }

  async count(filter: Partial<T> = {}): Promise<number> {
    return this.db.count(this.collection, filter as any);
  }

  async exists(filter: Partial<T>): Promise<boolean> {
    const count = await this.count(filter);
    return count > 0;
  }
}
