-- 008-create-draft-assignments.sql
-- Tracks ad-hoc review assignments (Option A: advisory, non-blocking).
-- A manager or partner can assign another user to review a draft.
-- The assignee sees it as actionable but the original reviewer retains approval power.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'draft_assignments' AND schema_id = SCHEMA_ID('billing'))
BEGIN
  CREATE TABLE billing.draft_assignments (
    id              INT IDENTITY(1,1)   PRIMARY KEY,
    instance_id     INT                 NOT NULL,       -- FK to workflow_instances
    draft_fee_idx   INT                 NOT NULL,       -- denormalized for fast lookup
    stage_code      CHAR(3)             NOT NULL,       -- MR or PR (stage when assigned)
    assigned_by     NVARCHAR(255)       NOT NULL,       -- reviewer who created the assignment
    assigned_to     NVARCHAR(255)       NOT NULL,       -- person asked to review
    status          NVARCHAR(20)        NOT NULL DEFAULT 'PENDING',  -- PENDING, REVIEWED, DECLINED
    assigned_at     DATETIME2           NOT NULL DEFAULT GETUTCDATE(),
    completed_at    DATETIME2           NULL,
    comments        NVARCHAR(MAX)       NULL,

    CONSTRAINT FK_assignments_instance FOREIGN KEY (instance_id)
      REFERENCES billing.workflow_instances(instance_id),
    CONSTRAINT CK_assignment_status CHECK (status IN ('PENDING', 'REVIEWED', 'DECLINED'))
  );

  CREATE INDEX IX_draft_assignments_to     ON billing.draft_assignments (assigned_to, status);
  CREATE INDEX IX_draft_assignments_draft  ON billing.draft_assignments (draft_fee_idx, status);
  CREATE INDEX IX_draft_assignments_inst   ON billing.draft_assignments (instance_id);
END
GO
