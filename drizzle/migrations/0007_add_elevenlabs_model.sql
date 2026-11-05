ALTER TABLE "server_settings" ADD COLUMN IF NOT EXISTS "elevenlabs_model_id" text DEFAULT 'eleven_v3' NOT NULL;
