-- One row: the key that signs phone sessions, and the single-use pairing code the frame shows as a QR.
CREATE TABLE auth(id INTEGER PRIMARY KEY CHECK(id=1),session_key TEXT NOT NULL,pairing_token TEXT,pairing_expires_at TEXT,paired_at TEXT);
INSERT INTO auth(id,session_key) VALUES(1,lower(hex(randomblob(32))));
