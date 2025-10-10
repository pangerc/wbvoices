-- Migration: Convert voice_approvals to voice_blacklist (whitelist → blacklist)

-- Step 1: Rename the table
ALTER TABLE "voice_approvals" RENAME TO "voice_blacklist";

-- Step 2: Rename the notes column to reason
ALTER TABLE "voice_blacklist" RENAME COLUMN "notes" TO "reason";

-- Step 3: Drop the status column (no longer needed - presence = blacklisted)
ALTER TABLE "voice_blacklist" DROP COLUMN "status";

-- Step 4: Rename indexes to match new table name
ALTER INDEX "approval_voice_key_idx" RENAME TO "blacklist_voice_key_idx";
ALTER INDEX "language_accent_idx" RENAME TO "blacklist_language_accent_idx";

-- Step 5: Clear existing data (flipping from whitelist to blacklist)
-- Old data was "approved" entries, we want to start fresh with blacklist
TRUNCATE TABLE "voice_blacklist";
