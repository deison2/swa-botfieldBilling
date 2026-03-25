-- 006-create-auto-approvals.sql
-- Reviewer auto-approval relationships.
-- Two relationship types:
--   'PR_SKIP' — Partner pre-approves a Manager → Partner Review skipped after MR
--   'OR_SKIP' — Originator pre-approves a Partner → Originator Review skipped after PR
--
-- approver_email = the person granting the auto-approval (partner or originator)
-- reviewee_email = the person whose review triggers the skip (manager or partner)

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'reviewer_auto_approvals' AND schema_id = SCHEMA_ID('billing'))
CREATE TABLE billing.reviewer_auto_approvals (
  id                INT            IDENTITY(1,1) PRIMARY KEY,
  relationship_type VARCHAR(10)    NOT NULL CHECK (relationship_type IN ('PR_SKIP', 'OR_SKIP')),
  approver_email    NVARCHAR(200)  NOT NULL,
  reviewee_email    NVARCHAR(200)  NOT NULL,
  created_by        NVARCHAR(200)  NOT NULL,
  created_at        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  revoked_at        DATETIME2      NULL,
  CONSTRAINT UQ_auto_approval UNIQUE (relationship_type, approver_email, reviewee_email)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_auto_approvals_approver')
  CREATE INDEX IX_auto_approvals_approver
    ON billing.reviewer_auto_approvals (approver_email, relationship_type)
    WHERE revoked_at IS NULL;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_auto_approvals_reviewee')
  CREATE INDEX IX_auto_approvals_reviewee
    ON billing.reviewer_auto_approvals (reviewee_email, relationship_type)
    WHERE revoked_at IS NULL;
