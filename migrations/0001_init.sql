-- Esquema inicial. Valores em centavos (inteiros) para evitar erros de arredondamento.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- kind 'despesa': user_id é quem pagou. kind 'venda': user_id é quem recebeu o dinheiro
-- (venda de peça, entrada de valor) e o valor abate do total de despesas.
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  kind TEXT NOT NULL DEFAULT 'despesa' CHECK (kind IN ('despesa', 'venda')),
  user_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER REFERENCES categories(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- Acerto: from_user transferiu dinheiro para to_user.
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  from_user INTEGER NOT NULL REFERENCES users(id),
  to_user INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_user <> to_user)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT NOT NULL,
  ts INTEGER NOT NULL
);

-- Categorias criadas a partir da planilha original (itens parecidos foram unidos).
INSERT OR IGNORE INTO categories(name) VALUES
  ('Marina'),
  ('Marinheiro'),
  ('Mão de obra e serviços'),
  ('Velas, lonas e capas'),
  ('Cabos, ferragens e fundeio'),
  ('Elétrica e eletrônica'),
  ('Motor e combustível'),
  ('Casco e reforma'),
  ('Materiais e ferramentas'),
  ('Equipamentos de bordo'),
  ('Clube, títulos e regatas'),
  ('Vendas e entradas'),
  ('Outros');
