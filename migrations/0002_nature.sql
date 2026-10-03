-- Tipo (natureza) da despesa: manutenção, melhoria, custos de marina ou outros.
ALTER TABLE expenses ADD COLUMN nature TEXT NOT NULL DEFAULT 'outro'
  CHECK (nature IN ('manutencao', 'melhoria', 'marina', 'outro'));
