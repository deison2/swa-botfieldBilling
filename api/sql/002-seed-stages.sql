-- 002-seed-stages.sql
-- Run manually after 001-create-tables.sql
-- Seeds the 5 workflow stages (idempotent MERGE)

MERGE workflow_stage_definitions AS tgt
USING (VALUES
  (1, 'BR',   'Billing Review',     1, 1),
  (2, 'MR',   'Manager Review',     2, 3),
  (3, 'PR',   'Partner Review',     3, 2),
  (4, 'OR',   'Originator Review',  4, 1),
  (5, 'POST', 'Post',               5, 1)
) AS src (stage_id, stage_code, stage_name, stage_order, default_days)
ON tgt.stage_id = src.stage_id
WHEN MATCHED THEN
  UPDATE SET
    stage_code   = src.stage_code,
    stage_name   = src.stage_name,
    stage_order  = src.stage_order,
    default_days = src.default_days
WHEN NOT MATCHED THEN
  INSERT (stage_id, stage_code, stage_name, stage_order, default_days)
  VALUES (src.stage_id, src.stage_code, src.stage_name, src.stage_order, src.default_days);
