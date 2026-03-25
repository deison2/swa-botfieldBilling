-- 003-create-draft-versions.sql
-- Stores versioned snapshots of draft analysis and narrative data.
-- Run manually against Azure SQL (billing schema).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'draft_versions' AND schema_id = SCHEMA_ID('billing'))
BEGIN
  CREATE TABLE billing.draft_versions (
    version_id      INT IDENTITY(1,1) PRIMARY KEY,
    draft_fee_idx   INT            NOT NULL,
    cycle_id        INT            NOT NULL,
    version_number  INT            NOT NULL,
    analysis_data   NVARCHAR(MAX)  NULL,   -- full JSON snapshot of analysis rows
    narrative_data  NVARCHAR(MAX)  NULL,   -- full JSON snapshot of narrative rows
    created_by      VARCHAR(200)   NOT NULL,
    reason          NVARCHAR(500)  NULL,
    created_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_draft_versions_idx_cycle_ver
      UNIQUE (draft_fee_idx, cycle_id, version_number),

    CONSTRAINT FK_draft_versions_cycle
      FOREIGN KEY (cycle_id) REFERENCES billing.billing_cycles(cycle_id)
  );
END;
