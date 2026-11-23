-- Existing rows came from the identified form. Empty identity strings on new
-- rows mean anonymous; no synthetic address is used for the Cloud forward.
ALTER TABLE support_messages ADD COLUMN reason TEXT NOT NULL DEFAULT 'feedback';
ALTER TABLE support_messages ADD COLUMN contact_preference TEXT NOT NULL DEFAULT 'reply';
ALTER TABLE support_messages ADD COLUMN diagnostics_reference TEXT NOT NULL DEFAULT '';
