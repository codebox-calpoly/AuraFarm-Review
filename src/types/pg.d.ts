declare module "pg" {
  export type QueryResult<TRow = Record<string, unknown>> = {
    rowCount: number | null;
    rows: TRow[];
  };

  export class PoolClient {
    query<TRow = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<TRow>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: unknown);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<TRow = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<TRow>>;
  }
}
