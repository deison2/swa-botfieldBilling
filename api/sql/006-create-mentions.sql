-- 006-create-mentions.sql
-- Tracks @mentions in workflow comments so each user has independent read/unread state.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'comment_mentions' AND schema_id = SCHEMA_ID('billing'))
BEGIN
  CREATE TABLE billing.comment_mentions (
    mention_id      INT            IDENTITY(1,1) PRIMARY KEY,
    action_id       INT            NOT NULL REFERENCES billing.workflow_actions(action_id),
    draft_fee_idx   INT            NOT NULL,
    mentioned_email VARCHAR(200)   NOT NULL,
    mentioned_by    VARCHAR(200)   NOT NULL,
    is_read         BIT            NOT NULL DEFAULT 0,
    created_at      DATETIME2      NOT NULL DEFAULT GETUTCDATE(),

    INDEX IX_mentions_email_unread (mentioned_email, is_read) INCLUDE (draft_fee_idx, created_at),
    INDEX IX_mentions_draft (draft_fee_idx, mentioned_email)
  );
END
GO
