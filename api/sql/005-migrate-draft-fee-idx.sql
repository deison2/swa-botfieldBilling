-- 005-migrate-draft-fee-idx.sql
-- Migrates workflow_instances from draft_id (FK to draft_invoices) to draft_fee_idx (direct PE key).
-- Run manually via SSMS / Azure Data Studio.

-- 1) Add draft_fee_idx column to workflow_instances if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('billing.workflow_instances') AND name = 'draft_fee_idx')
BEGIN
  ALTER TABLE billing.workflow_instances ADD draft_fee_idx INT NULL;
END;

-- 2) Backfill draft_fee_idx from draft_invoices
UPDATE wi
SET wi.draft_fee_idx = di.draft_fee_idx
FROM billing.workflow_instances wi
JOIN billing.draft_invoices di ON wi.draft_id = di.draft_id
WHERE wi.draft_fee_idx IS NULL;

-- 3) Make draft_fee_idx NOT NULL (after backfill)
-- Only run this if all rows have been backfilled:
-- ALTER TABLE billing.workflow_instances ALTER COLUMN draft_fee_idx INT NOT NULL;

-- 4) Add unique constraint on (cycle_id, draft_fee_idx)
-- IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_workflow_instances_cycle_fee')
--   ALTER TABLE billing.workflow_instances ADD CONSTRAINT UQ_workflow_instances_cycle_fee UNIQUE (cycle_id, draft_fee_idx);

-- 5) Drop the old draft_id FK and column (only after confirming everything works):
-- ALTER TABLE billing.workflow_instances DROP CONSTRAINT [FK name here];
-- ALTER TABLE billing.workflow_instances DROP COLUMN draft_id;

-- 6) Update draft_invoices PK to use (cycle_id, draft_fee_idx) instead of draft_id identity:
-- This is a bigger change — for new installs use 001-create-tables.sql directly.
-- For existing installs, the old draft_invoices table can remain as-is since
-- workflow_instances no longer references draft_id.
