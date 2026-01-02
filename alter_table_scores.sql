-- Add new columns for scores
ALTER TABLE seminaristes ADD COLUMN IF NOT EXISTS test_sortie FLOAT DEFAULT 0;
ALTER TABLE seminaristes ADD COLUMN IF NOT EXISTS note_conduite FLOAT DEFAULT 16;
