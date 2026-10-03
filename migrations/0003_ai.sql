-- Cache das classificações feitas por IA (mesma descrição não é enviada duas vezes) e controle de custo.
CREATE TABLE IF NOT EXISTS classifications (
  key TEXT PRIMARY KEY,          -- descrição normalizada (minúsculas, sem acento)
  category TEXT NOT NULL,        -- nome da categoria
  nature TEXT NOT NULL CHECK (nature IN ('manutencao', 'melhoria', 'marina', 'outro')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_calls (ts INTEGER NOT NULL);
