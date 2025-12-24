-- Copy this entire block and paste it into the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS seminaristes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  matricule TEXT UNIQUE,
  nom TEXT,
  prenom TEXT,
  age INTEGER,
  note FLOAT,
  genre TEXT,
  niveau TEXT,
  dortoir TEXT,
  halaqa TEXT,
  contact TEXT,
  photo_url TEXT
);

-- Optional: Enable Row Level Security (RLS) if you want to restrict access
-- ALTER TABLE seminaristes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON seminaristes FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for all users" ON seminaristes FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Enable update for all users" ON seminaristes FOR UPDATE USING (true);
-- CREATE POLICY "Enable delete for all users" ON seminaristes FOR DELETE USING (true);
