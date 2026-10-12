CREATE TABLE admin_event_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  events JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(events) = 'array')
);
INSERT INTO admin_event_settings (id) VALUES (1);
