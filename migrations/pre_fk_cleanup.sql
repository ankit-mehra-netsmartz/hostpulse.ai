-- =============================================================================
-- PRE-MIGRATION CLEANUP SCRIPT
-- Run this BEFORE applying 0000_good_unicorn.sql to avoid constraint violations.
-- It removes orphaned rows (for CASCADE FKs) and nullifies dangling references
-- (for SET NULL FKs) so no existing row violates a new constraint.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SET NULL — nullable FK columns that may point to non-existent parents
-- ---------------------------------------------------------------------------

-- listings.default_procedure_id → procedures.id  (SET NULL)
UPDATE listings
SET default_procedure_id = NULL
WHERE default_procedure_id IS NOT NULL
  AND default_procedure_id NOT IN (SELECT id FROM procedures);

-- ai_usage_logs.listing_id → listings.id  (SET NULL)
UPDATE ai_usage_logs
SET listing_id = NULL
WHERE listing_id IS NOT NULL
  AND listing_id NOT IN (SELECT id FROM listings);

-- webhook_logs.reservation_id → reservations.id  (SET NULL)
UPDATE webhook_logs
SET reservation_id = NULL
WHERE reservation_id IS NOT NULL
  AND reservation_id NOT IN (SELECT id FROM reservations);

-- webhook_logs.listing_id → listings.id  (SET NULL)
UPDATE webhook_logs
SET listing_id = NULL
WHERE listing_id IS NOT NULL
  AND listing_id NOT IN (SELECT id FROM listings);

-- tags.theme_id → themes.id  (SET NULL)
UPDATE tags
SET theme_id = NULL
WHERE theme_id IS NOT NULL
  AND theme_id NOT IN (SELECT id FROM themes);

-- tasks.tag_id → tags.id  (SET NULL)
UPDATE tasks
SET tag_id = NULL
WHERE tag_id IS NOT NULL
  AND tag_id NOT IN (SELECT id FROM tags);

-- tasks.theme_id → themes.id  (SET NULL)
UPDATE tasks
SET theme_id = NULL
WHERE theme_id IS NOT NULL
  AND theme_id NOT IN (SELECT id FROM themes);

-- tasks.listing_id → listings.id  (SET NULL)
UPDATE tasks
SET listing_id = NULL
WHERE listing_id IS NOT NULL
  AND listing_id NOT IN (SELECT id FROM listings);

-- lumi_queries.view_id → lumi_views.id  (SET NULL)
UPDATE lumi_queries
SET view_id = NULL
WHERE view_id IS NOT NULL
  AND view_id NOT IN (SELECT id FROM lumi_views);

-- lumi_documents.query_id → lumi_queries.id  (SET NULL)
UPDATE lumi_documents
SET query_id = NULL
WHERE query_id IS NOT NULL
  AND query_id NOT IN (SELECT id FROM lumi_queries);

-- generated_content.prompt_id → ai_prompts.id  (SET NULL)
UPDATE generated_content
SET prompt_id = NULL
WHERE prompt_id IS NOT NULL
  AND prompt_id NOT IN (SELECT id FROM ai_prompts);

-- procedures.listing_id → listings.id  (SET NULL)
UPDATE procedures
SET listing_id = NULL
WHERE listing_id IS NOT NULL
  AND listing_id NOT IN (SELECT id FROM listings);

-- procedure_steps.source_module_id → task_modules.id  (SET NULL)
UPDATE procedure_steps
SET source_module_id = NULL
WHERE source_module_id IS NOT NULL
  AND source_module_id NOT IN (SELECT id FROM task_modules);

-- folders.parent_id → folders.id  (SET NULL — self-ref)
UPDATE folders
SET parent_id = NULL
WHERE parent_id IS NOT NULL
  AND parent_id NOT IN (SELECT id FROM folders);

-- task_attachments.task_id → tasks.id  (SET NULL)
UPDATE task_attachments
SET task_id = NULL
WHERE task_id IS NOT NULL
  AND task_id NOT IN (SELECT id FROM tasks);

-- task_attachments.procedure_step_id → procedure_steps.id  (SET NULL)
UPDATE task_attachments
SET procedure_step_id = NULL
WHERE procedure_step_id IS NOT NULL
  AND procedure_step_id NOT IN (SELECT id FROM procedure_steps);

-- nudge_conversations.reservation_id → reservations.id  (SET NULL)
UPDATE nudge_conversations
SET reservation_id = NULL
WHERE reservation_id IS NOT NULL
  AND reservation_id NOT IN (SELECT id FROM reservations);

-- nudge_conversations.listing_id → listings.id  (SET NULL)
UPDATE nudge_conversations
SET listing_id = NULL
WHERE listing_id IS NOT NULL
  AND listing_id NOT IN (SELECT id FROM listings);

-- cleaners.parent_id → cleaners.id  (SET NULL — self-ref)
UPDATE cleaners
SET parent_id = NULL
WHERE parent_id IS NOT NULL
  AND parent_id NOT IN (SELECT id FROM cleaners);

-- cleaner_assignments.procedure_id → procedures.id  (SET NULL)
UPDATE cleaner_assignments
SET procedure_id = NULL
WHERE procedure_id IS NOT NULL
  AND procedure_id NOT IN (SELECT id FROM procedures);

-- cleaning_tasks.assigned_member_id → cleaners.id  (SET NULL)
UPDATE cleaning_tasks
SET assigned_member_id = NULL
WHERE assigned_member_id IS NOT NULL
  AND assigned_member_id NOT IN (SELECT id FROM cleaners);

-- cleaning_tasks.reservation_id → reservations.id  (SET NULL)
UPDATE cleaning_tasks
SET reservation_id = NULL
WHERE reservation_id IS NOT NULL
  AND reservation_id NOT IN (SELECT id FROM reservations);

-- cleaning_tasks.assignment_id → cleaner_assignments.id  (SET NULL)
UPDATE cleaning_tasks
SET assignment_id = NULL
WHERE assignment_id IS NOT NULL
  AND assignment_id NOT IN (SELECT id FROM cleaner_assignments);

-- cleaning_tasks.procedure_id → procedures.id  (SET NULL)
UPDATE cleaning_tasks
SET procedure_id = NULL
WHERE procedure_id IS NOT NULL
  AND procedure_id NOT IN (SELECT id FROM procedures);

-- review_removal_cases.reservation_id → reservations.id  (SET NULL)
UPDATE review_removal_cases
SET reservation_id = NULL
WHERE reservation_id IS NOT NULL
  AND reservation_id NOT IN (SELECT id FROM reservations);

-- review_removal_cases.listing_id → listings.id  (SET NULL)
UPDATE review_removal_cases
SET listing_id = NULL
WHERE listing_id IS NOT NULL
  AND listing_id NOT IN (SELECT id FROM listings);

-- ---------------------------------------------------------------------------
-- 2. CASCADE — delete orphaned child rows whose parent no longer exists
--    Work in dependency order: deepest children first.
-- ---------------------------------------------------------------------------

-- step_completions → procedure_completions (CASCADE)
DELETE FROM step_completions
WHERE procedure_completion_id NOT IN (SELECT id FROM procedure_completions);

-- step_completions → procedure_steps (CASCADE)
DELETE FROM step_completions
WHERE procedure_step_id NOT IN (SELECT id FROM procedure_steps);

-- procedure_completions → procedure_assignments (CASCADE)
DELETE FROM procedure_completions
WHERE procedure_assignment_id NOT IN (SELECT id FROM procedure_assignments);

-- procedure_assignments → tasks (CASCADE)
DELETE FROM procedure_assignments
WHERE task_id NOT IN (SELECT id FROM tasks);

-- procedure_assignments → procedures (CASCADE)
DELETE FROM procedure_assignments
WHERE procedure_id NOT IN (SELECT id FROM procedures);

-- procedure_steps → procedures (CASCADE)
DELETE FROM procedure_steps
WHERE procedure_id NOT IN (SELECT id FROM procedures);

-- procedure_template_steps → procedure_templates (CASCADE)
DELETE FROM procedure_template_steps
WHERE template_id NOT IN (SELECT id FROM procedure_templates);

-- task_module_items → task_modules (CASCADE)
DELETE FROM task_module_items
WHERE module_id NOT IN (SELECT id FROM task_modules);

-- task_modules → workspaces (CASCADE)
DELETE FROM task_modules
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- folder_items → folders (CASCADE)
DELETE FROM folder_items
WHERE folder_id NOT IN (SELECT id FROM folders);

-- folder_items → workspaces (CASCADE)
DELETE FROM folder_items
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- task_attachments → folder_items (CASCADE)
DELETE FROM task_attachments
WHERE folder_item_id NOT IN (SELECT id FROM folder_items);

-- task_attachments → workspaces (CASCADE)
DELETE FROM task_attachments
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- folders → workspaces (CASCADE)
DELETE FROM folders
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- nudge_messages → nudge_conversations (CASCADE)
DELETE FROM nudge_messages
WHERE conversation_id NOT IN (SELECT id FROM nudge_conversations);

-- nudge_conversations → nudge_campaigns (CASCADE)
DELETE FROM nudge_conversations
WHERE campaign_id NOT IN (SELECT id FROM nudge_campaigns);

-- nudge_campaigns → workspaces (CASCADE)
DELETE FROM nudge_campaigns
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- cleaning_task_items → cleaning_tasks (CASCADE)
DELETE FROM cleaning_task_items
WHERE cleaning_task_id NOT IN (SELECT id FROM cleaning_tasks);

-- cleaning_tasks → workspaces (CASCADE)
DELETE FROM cleaning_tasks
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- cleaning_tasks → cleaners (CASCADE) — cleaner_id
DELETE FROM cleaning_tasks
WHERE cleaner_id NOT IN (SELECT id FROM cleaners);

-- cleaning_tasks → listings (CASCADE)
DELETE FROM cleaning_tasks
WHERE listing_id NOT IN (SELECT id FROM listings);

-- cleaner_assignments → workspaces (CASCADE)
DELETE FROM cleaner_assignments
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- cleaner_assignments → cleaners (CASCADE)
DELETE FROM cleaner_assignments
WHERE cleaner_id NOT IN (SELECT id FROM cleaners);

-- cleaner_assignments → listings (CASCADE)
DELETE FROM cleaner_assignments
WHERE listing_id NOT IN (SELECT id FROM listings);

-- cleaners → workspaces (CASCADE)
DELETE FROM cleaners
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- tags → listings (CASCADE)
DELETE FROM tags
WHERE listing_id NOT IN (SELECT id FROM listings);

-- tags → reservations (CASCADE)
DELETE FROM tags
WHERE reservation_id NOT IN (SELECT id FROM reservations);

-- reservations → listings (CASCADE)
DELETE FROM reservations
WHERE listing_id NOT IN (SELECT id FROM listings);

-- listing_analyses → listings (CASCADE)
DELETE FROM listing_analyses
WHERE listing_id NOT IN (SELECT id FROM listings);

-- photo_analyses → listings (CASCADE)
DELETE FROM photo_analyses
WHERE listing_id NOT IN (SELECT id FROM listings);

-- airbnb_scans → listings (CASCADE)
DELETE FROM airbnb_scans
WHERE listing_id NOT IN (SELECT id FROM listings);

-- airbnb_scans → workspaces (CASCADE)
DELETE FROM airbnb_scans
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- speed_test_runs → listings (CASCADE)
DELETE FROM speed_test_runs
WHERE listing_id NOT IN (SELECT id FROM listings);

-- speed_test_runs → workspaces (CASCADE)
DELETE FROM speed_test_runs
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- generated_content → listings (CASCADE)
DELETE FROM generated_content
WHERE listing_id NOT IN (SELECT id FROM listings);

-- generated_content → workspaces (CASCADE)
DELETE FROM generated_content
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- procedures → workspaces (CASCADE)
DELETE FROM procedures
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- reviews_summaries → workspaces (CASCADE)
DELETE FROM reviews_summaries
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- lumi_views → workspaces (CASCADE)
DELETE FROM lumi_views
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- lumi_queries → workspaces (CASCADE)
DELETE FROM lumi_queries
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- lumi_documents → workspaces (CASCADE)
DELETE FROM lumi_documents
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- reports → workspaces (CASCADE)
DELETE FROM reports
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- notion_connections → workspaces (CASCADE)
DELETE FROM notion_connections
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- notification_templates → workspaces (CASCADE)
DELETE FROM notification_templates
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- review_removal_cases → workspaces (CASCADE)
DELETE FROM review_removal_cases
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- workspace_members → workspaces (CASCADE)
DELETE FROM workspace_members
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- teams → workspaces (CASCADE)
DELETE FROM teams
WHERE workspace_id NOT IN (SELECT id FROM workspaces);

-- team_members → teams (CASCADE)
DELETE FROM team_members
WHERE team_id NOT IN (SELECT id FROM teams);

-- listings → data_sources (CASCADE)
DELETE FROM listings
WHERE data_source_id NOT IN (SELECT id FROM data_sources);

COMMIT;
