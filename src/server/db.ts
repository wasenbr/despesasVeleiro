/** Interface mínima de banco usada pela API. O D1 da Cloudflare e o adaptador SQLite do Node a implementam. */
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { last_row_id: number; changes: number } }>;
}

export interface Db {
  prepare(sql: string): Stmt;
  /** Executa todas as instruções de forma atômica (transação). */
  batch(stmts: Stmt[]): Promise<unknown[]>;
}
