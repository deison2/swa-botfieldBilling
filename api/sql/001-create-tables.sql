-- 001-create-tables.sql
-- Run manually via Azure Portal / SSMS / Azure Data Studio
-- Creates the 5 core workflow tables + indexes (idempotent)

-- 1. Workflow stage definitions (static lookup)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'workflow_stage_definitions')
CREATE TABLE workflow_stage_definitions (
  stage_id      TINYINT       NOT NULL PRIMARY KEY,
  stage_code    VARCHAR(10)   NOT NULL UNIQUE,
  stage_name    VARCHAR(50)   NOT NULL,
  stage_order   TINYINT       NOT NULL UNIQUE,
  default_days  TINYINT       NOT NULL DEFAULT 3
);

-- 2. Billing cycles
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'billing_cycles')
CREATE TABLE billing_cycles (
  cycle_id          INT           IDENTITY(1,1) PRIMARY KEY,
  cycle_name        NVARCHAR(100) NULL,
  period_month      TINYINT       NOT NULL,
  period_year       SMALLINT      NOT NULL,
  cycle_start       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
  br_due            DATETIME2     NULL,
  mr_due            DATETIME2     NULL,
  pr_due            DATETIME2     NULL,
  or_due            DATETIME2     NULL,
  post_due          DATETIME2     NULL,
  lock_after_signoff BIT          NOT NULL DEFAULT 1,
  is_active         BIT           NOT NULL DEFAULT 1,
  created_at        DATETIME2     NOT NULL DEFAULT GETUTCDATE()
);

-- 3. Draft invoices (ingested from PE)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'draft_invoices')
CREATE TABLE draft_invoices (
  draft_fee_idx   INT             NOT NULL,
  cycle_id        INT             NOT NULL REFERENCES billing_cycles(cycle_id),
  client_code     NVARCHAR(50)    NULL,
  client_name     NVARCHAR(200)   NULL,
  raw_payload     NVARCHAR(MAX)   NULL,
  ingested_at     DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT PK_draft_invoices PRIMARY KEY (cycle_id, draft_fee_idx)
);

-- 4. Workflow instances (one per draft per cycle)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'workflow_instances')
CREATE TABLE workflow_instances (
  instance_id          INT            IDENTITY(1,1) PRIMARY KEY,
  draft_fee_idx        INT            NOT NULL,
  cycle_id             INT            NOT NULL REFERENCES billing_cycles(cycle_id),
  billing_reviewer     NVARCHAR(200)  NULL,
  manager_reviewer     NVARCHAR(200)  NULL,
  partner_reviewer     NVARCHAR(200)  NULL,
  originator_reviewer  NVARCHAR(200)  NULL,
  current_stage_id     TINYINT        NOT NULL REFERENCES workflow_stage_definitions(stage_id),
  current_status       VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
  br_completed_at      DATETIME2      NULL,
  mr_completed_at      DATETIME2      NULL,
  pr_completed_at      DATETIME2      NULL,
  or_completed_at      DATETIME2      NULL,
  posted_at            DATETIME2      NULL,
  created_at           DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_at           DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  CONSTRAINT UQ_workflow_instances_cycle_fee UNIQUE (cycle_id, draft_fee_idx)
);

-- 5. Workflow actions (audit trail)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'workflow_actions')
CREATE TABLE workflow_actions (
  action_id      INT            IDENTITY(1,1) PRIMARY KEY,
  instance_id    INT            NOT NULL REFERENCES workflow_instances(instance_id),
  cycle_id       INT            NOT NULL REFERENCES billing_cycles(cycle_id),
  stage_id       TINYINT        NOT NULL REFERENCES workflow_stage_definitions(stage_id),
  action_type    VARCHAR(20)    NOT NULL,
  action_by      NVARCHAR(200)  NOT NULL,
  comments       NVARCHAR(MAX)  NULL,
  reassigned_to  NVARCHAR(200)  NULL,
  created_at     DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

-- Indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_workflow_instances_cycle_stage')
  CREATE INDEX IX_workflow_instances_cycle_stage
    ON workflow_instances (cycle_id, current_stage_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_workflow_instances_draft_fee')
  CREATE INDEX IX_workflow_instances_draft_fee
    ON workflow_instances (draft_fee_idx);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_workflow_instances_manager')
  CREATE INDEX IX_workflow_instances_manager
    ON workflow_instances (manager_reviewer);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_workflow_instances_partner')
  CREATE INDEX IX_workflow_instances_partner
    ON workflow_instances (partner_reviewer);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_workflow_actions_instance')
  CREATE INDEX IX_workflow_actions_instance
    ON workflow_actions (instance_id);
