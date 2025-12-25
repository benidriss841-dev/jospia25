-- COPIEZ TOUT CE CODE
-- Allez dans Supabase > SQL Editor
-- Collez et cliquez sur "RUN"

-- 1. Assure que la réplication est active pour la table
ALTER TABLE seminaristes REPLICA IDENTITY FULL;

-- 2. Ajoute la table à la publication 'supabase_realtime' (c'est le canal par défaut)
ALTER PUBLICATION supabase_realtime ADD TABLE seminaristes;

-- 3. Vérification (optionnel, pour voir si ça a marché)
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
