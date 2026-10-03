-- Auditoria: quem alterou cada lançamento e acerto por último (created_by guarda quem lançou).
ALTER TABLE expenses ADD COLUMN updated_by INTEGER REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN updated_at TEXT;
ALTER TABLE settlements ADD COLUMN updated_by INTEGER REFERENCES users(id);
ALTER TABLE settlements ADD COLUMN updated_at TEXT;
