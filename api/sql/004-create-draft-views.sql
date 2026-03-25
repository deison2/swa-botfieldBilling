-- Tracks when each user last viewed a draft's review modal
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'draft_views' AND schema_id = SCHEMA_ID('billing'))
BEGIN
  CREATE TABLE billing.draft_views (
    draft_fee_idx   INT            NOT NULL,
    user_email      VARCHAR(200)   NOT NULL,
    last_viewed_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_draft_views PRIMARY KEY (draft_fee_idx, user_email)
  );
END;
