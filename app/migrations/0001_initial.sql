CREATE TABLE species(id TEXT PRIMARY KEY,scientific_name TEXT UNIQUE NOT NULL,common_name TEXT NOT NULL,artwork_url TEXT);
CREATE TABLE captures(id TEXT PRIMARY KEY,kind TEXT NOT NULL,status TEXT NOT NULL,metadata TEXT NOT NULL,crop TEXT,identification TEXT,error TEXT,created_at TEXT NOT NULL,media_type TEXT NOT NULL,idempotency_key TEXT UNIQUE,metadata_corrected INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sightings(id TEXT PRIMARY KEY,capture_id TEXT NOT NULL REFERENCES captures(id),species_id TEXT NOT NULL REFERENCES species(id),identified_by TEXT NOT NULL,captured_at TEXT NOT NULL,location TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(capture_id,species_id));
CREATE TABLE frame(id INTEGER PRIMARY KEY CHECK(id=1),settings TEXT NOT NULL,revision TEXT,last_contact_at TEXT,acknowledged_revision TEXT,error TEXT,dirty INTEGER NOT NULL DEFAULT 1);
INSERT INTO frame(id,settings) VALUES(1,'{"mode":"week","speciesIds":[],"showNames":true}');
