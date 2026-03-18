CREATE TABLE "ai_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"prompt_template" text,
	"is_active" varchar DEFAULT 'true',
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"model_id" varchar,
	"category" varchar,
	"system_prompt" text,
	"version" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"label" varchar NOT NULL,
	"model" varchar NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost" real DEFAULT 0 NOT NULL,
	"listing_id" varchar,
	"listing_name" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "airbnb_scans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"airbnb_url" text NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"where_youll_sleep" jsonb,
	"has_where_youll_sleep" boolean,
	"is_superhost" boolean,
	"guest_favorite_tier" varchar,
	"host_profile" jsonb,
	"raw_snapshot" jsonb,
	"ai_analysis" jsonb,
	"scanned_at" timestamp,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(255),
	"host_benefit" text,
	"commit_hash" varchar(40),
	"status" varchar(20) DEFAULT 'suggested' NOT NULL,
	"suggested_at" timestamp DEFAULT now(),
	"approved_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "changelog_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_time" varchar(10) DEFAULT '09:00' NOT NULL,
	"notification_type" varchar(20) DEFAULT 'both' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp,
	"suggest_time" varchar(10) DEFAULT '18:00' NOT NULL,
	"suggest_interval_days" integer DEFAULT 1 NOT NULL,
	"suggest_enabled" boolean DEFAULT true NOT NULL,
	"last_processed_commit" varchar(64),
	"last_suggest_run_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cleaner_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"cleaner_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"procedure_id" varchar,
	"assignment_mode" varchar(20) DEFAULT 'manual' NOT NULL,
	"default_member_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cleaners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) DEFAULT 'individual' NOT NULL,
	"parent_id" varchar,
	"user_id" varchar,
	"invite_token" varchar,
	"email" varchar(255),
	"phone" varchar(50),
	"notify_by_email" boolean DEFAULT true NOT NULL,
	"notify_by_sms" boolean DEFAULT true NOT NULL,
	"reminder_timing" varchar(20) DEFAULT 'morning_of' NOT NULL,
	"reminder_time" varchar(5) DEFAULT '08:00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cleaning_task_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cleaning_task_id" varchar NOT NULL,
	"step_order" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"module_title" varchar(255),
	"module_order" integer,
	"requires_photo_verification" boolean DEFAULT false NOT NULL,
	"photo_verification_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"requires_gps_verification" boolean DEFAULT false NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"photo_url" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "cleaning_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"cleaner_id" varchar NOT NULL,
	"assigned_member_id" varchar,
	"listing_id" varchar NOT NULL,
	"reservation_id" varchar,
	"assignment_id" varchar,
	"procedure_id" varchar,
	"scheduled_date" timestamp NOT NULL,
	"guest_name" varchar(255),
	"guest_checkout_time" varchar(50),
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"reminder_sent_at" timestamp,
	"reminder_type" varchar(20),
	"started_at" timestamp,
	"completed_at" timestamp,
	"cleaner_accepted" boolean,
	"cleaner_accepted_at" timestamp,
	"notes" text,
	"access_token" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"provider" varchar DEFAULT 'hospitable' NOT NULL,
	"name" varchar NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_connected" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "folder_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"folder_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"file_url" text,
	"file_type" varchar,
	"file_size" integer,
	"mime_type" varchar,
	"link_url" text,
	"link_type" varchar,
	"thumbnail_url" text,
	"metadata" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"parent_id" varchar,
	"color" varchar,
	"icon" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "generated_content" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"content_type" varchar NOT NULL,
	"content" jsonb,
	"prompt_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listing_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"score" real,
	"pet_grade" varchar,
	"superhost_grade" varchar,
	"photos_grade" varchar,
	"reviews_grade" varchar,
	"guest_fav_grade" varchar,
	"title_grade" varchar,
	"sleep_grade" varchar,
	"superhost_status_grade" varchar,
	"description_grade" varchar,
	"ideal_grade" varchar,
	"suggestions" jsonb,
	"pet_analysis" jsonb,
	"superhost_analysis" jsonb,
	"photos_analysis" jsonb,
	"reviews_analysis" jsonb,
	"guest_fav_analysis" jsonb,
	"title_analysis" jsonb,
	"sleep_analysis" jsonb,
	"superhost_status_analysis" jsonb,
	"description_analysis" jsonb,
	"ideal_analysis" jsonb,
	"ideal_guest_profile" jsonb,
	"review_count" integer,
	"reservation_count" integer,
	"conversation_count" integer,
	"photo_analysis_status" varchar DEFAULT 'pending',
	"photo_analysis_progress" integer DEFAULT 0,
	"photo_analysis_total_photos" integer DEFAULT 0,
	"overall_grade" varchar,
	"completed_categories" jsonb DEFAULT '[]'::jsonb,
	"analyzed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"external_id" varchar,
	"name" varchar NOT NULL,
	"internal_name" varchar,
	"image_url" text,
	"public_url" text,
	"address" text,
	"property_type" varchar,
	"bedrooms" integer,
	"bathrooms" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_analyzed_at" timestamp,
	"auto_analysis_enabled" boolean DEFAULT false NOT NULL,
	"headline" text,
	"description" text,
	"summary" text,
	"space_overview" text,
	"guest_access" text,
	"house_manual" text,
	"other_details" text,
	"additional_rules" text,
	"neighborhood_description" text,
	"getting_around" text,
	"wifi_name" text,
	"amenities" jsonb,
	"images" jsonb,
	"house_rules" jsonb,
	"owner_name" varchar,
	"account_email" varchar,
	"last_synced_at" timestamp,
	"sync_days" integer DEFAULT 90 NOT NULL,
	"webhook_status" varchar DEFAULT 'active',
	"webhook_pending_data" jsonb,
	"platform_ids" jsonb,
	"default_procedure_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lumi_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"query_id" varchar,
	"title" varchar NOT NULL,
	"content" text,
	"document_type" varchar DEFAULT 'report',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lumi_queries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"conversation_id" varchar,
	"view_id" varchar,
	"prompt" text NOT NULL,
	"response" text,
	"response_type" varchar DEFAULT 'text',
	"sources" jsonb,
	"thinking_steps" jsonb,
	"is_saved" boolean DEFAULT false NOT NULL,
	"text_match_only" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lumi_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"filters" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lumi_workflows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"icon" varchar DEFAULT 'sparkles',
	"category" varchar DEFAULT 'general',
	"prompt_template" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"subject" varchar(500),
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notion_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"notion_workspace_id" varchar NOT NULL,
	"notion_workspace_name" varchar,
	"notion_workspace_icon" varchar,
	"access_token" text NOT NULL,
	"bot_id" varchar NOT NULL,
	"connected_by" varchar NOT NULL,
	"selected_database_id" varchar,
	"selected_database_name" varchar,
	"sync_reservations" boolean DEFAULT true NOT NULL,
	"sync_confirmed_tasks" boolean DEFAULT true NOT NULL,
	"sync_tags" boolean DEFAULT true NOT NULL,
	"reservations_database_id" varchar,
	"reservations_database_name" varchar,
	"tasks_database_id" varchar,
	"tasks_database_name" varchar,
	"tags_database_id" varchar,
	"tags_database_name" varchar,
	"property_filter" jsonb,
	"auto_sync_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nudge_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"trigger_type" varchar DEFAULT 'checkout' NOT NULL,
	"trigger_delay_hours" integer DEFAULT 24,
	"initial_message" text NOT NULL,
	"ai_instructions" text,
	"max_messages" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nudge_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"reservation_id" varchar,
	"workspace_id" varchar NOT NULL,
	"guest_name" varchar,
	"guest_phone" varchar NOT NULL,
	"listing_id" varchar,
	"listing_name" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"message_count" integer DEFAULT 0,
	"feedback_summary" text,
	"sentiment" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nudge_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"direction" varchar NOT NULL,
	"content" text NOT NULL,
	"twilio_message_id" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "photo_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar NOT NULL,
	"photo_index" integer NOT NULL,
	"photo_url" text NOT NULL,
	"image_width" integer,
	"image_height" integer,
	"is_low_resolution" boolean DEFAULT false,
	"technical_details" jsonb,
	"objects_detected" jsonb,
	"room_label" varchar,
	"recommendation" text,
	"analysis_type" varchar DEFAULT 'full' NOT NULL,
	"is_hero_recommendation" boolean DEFAULT false,
	"is_top5_recommendation" boolean DEFAULT false,
	"ai_edited_url" text,
	"ai_edited_prompt" text,
	"ai_edited_at" timestamp,
	"analyzed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "procedure_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"procedure_id" varchar NOT NULL,
	"assigned_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "procedure_completions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_assignment_id" varchar NOT NULL,
	"completed_by_user_id" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"voice_update_url" text,
	"voice_update_transcript" text,
	"ai_summary" text,
	"ai_summary_status" varchar(20),
	"notes" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "procedure_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_id" varchar NOT NULL,
	"step_order" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"module_title" varchar(255),
	"module_order" integer,
	"source_module_id" varchar,
	"media" jsonb,
	"voice_note_url" text,
	"voice_note_transcript" text,
	"voice_note_ai_summary" text,
	"voice_note_translation" text,
	"issues" jsonb,
	"completions" jsonb,
	"requires_photo_verification" boolean DEFAULT false NOT NULL,
	"photo_verification_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"requires_gps_verification" boolean DEFAULT false NOT NULL,
	"expected_gps_location" jsonb,
	"gps_radius_meters" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "procedure_template_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"step_order" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"module_title" varchar(255),
	"module_order" integer,
	"requires_photo_verification" boolean DEFAULT false NOT NULL,
	"photo_verification_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"requires_gps_verification" boolean DEFAULT false NOT NULL,
	"gps_radius_meters" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "procedure_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"updated_by_user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "procedures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"listing_id" varchar,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_via_ai" boolean DEFAULT false NOT NULL,
	"ai_prompt" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"report_type" varchar NOT NULL,
	"date_range_type" varchar DEFAULT 'last_30_days' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"selected_listing_ids" jsonb,
	"last_generated_at" timestamp,
	"ai_summary" text,
	"report_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"external_id" varchar NOT NULL,
	"confirmation_code" varchar,
	"guest_name" varchar,
	"guest_email" varchar,
	"guest_profile_picture" varchar,
	"guest_location" varchar,
	"platform" varchar DEFAULT 'Airbnb' NOT NULL,
	"check_in_date" timestamp,
	"check_out_date" timestamp,
	"status" varchar DEFAULT 'completed' NOT NULL,
	"public_review" text,
	"private_remarks" text,
	"host_reply" text,
	"conversation_history" jsonb,
	"review_posted_at" timestamp,
	"tags_processed_at" timestamp,
	"theme_eligible_at" timestamp,
	"guest_rating" real,
	"category_ratings" jsonb,
	"ai_sentiment_score" real,
	"ai_public_review_score" real,
	"ai_private_remarks_score" real,
	"ai_conversation_score" real,
	"ai_guest_summary" text,
	"review_analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_removal_cases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"reservation_id" varchar,
	"listing_id" varchar,
	"user_id" varchar NOT NULL,
	"case_number" varchar NOT NULL,
	"guest_name" varchar,
	"property_name" varchar,
	"review_text" text,
	"guest_rating" real,
	"category_ratings" jsonb,
	"stage" varchar DEFAULT 'analysis' NOT NULL,
	"likelihood" varchar,
	"likelihood_score" integer,
	"ai_analysis" jsonb,
	"challenge_history" jsonb DEFAULT '[]'::jsonb,
	"house_rules" text,
	"guest_messages" text,
	"resolution_messages" text,
	"status" varchar DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reviews_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"listing_ids" jsonb NOT NULL,
	"listing_ids_hash" varchar NOT NULL,
	"performance_insight" text,
	"strengths" jsonb,
	"areas_to_improve" jsonb,
	"analyzed_reservation_count" integer,
	"generated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "speed_test_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"listing_name" varchar,
	"openai_model" varchar NOT NULL,
	"grok_model" varchar NOT NULL,
	"days_back" integer NOT NULL,
	"reservation_count" integer NOT NULL,
	"results" jsonb NOT NULL,
	"overall_winner" varchar NOT NULL,
	"total_openai_time" integer NOT NULL,
	"total_grok_time" integer NOT NULL,
	"total_openai_cost" real NOT NULL,
	"total_grok_cost" real NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "step_completions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_completion_id" varchar NOT NULL,
	"procedure_step_id" varchar NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"verification_photo_url" text,
	"verification_gps" jsonb,
	"gps_verified" boolean,
	"notes" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"listing_id" varchar NOT NULL,
	"reservation_id" varchar NOT NULL,
	"theme_id" varchar,
	"pending_theme_name" varchar,
	"pending_theme_icon" varchar,
	"name" varchar NOT NULL,
	"sentiment" varchar DEFAULT 'neutral' NOT NULL,
	"priority" varchar DEFAULT 'medium',
	"summary" text,
	"verbatim_evidence" text,
	"source_type" varchar,
	"source_id" varchar,
	"suggested_task_title" text,
	"suggested_task_description" text,
	"added_to_theme_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"folder_item_id" varchar NOT NULL,
	"task_id" varchar,
	"sub_task_id" varchar,
	"procedure_step_id" varchar,
	"attached_by" varchar,
	"attached_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_module_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar NOT NULL,
	"item_order" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"requires_photo_verification" boolean DEFAULT false NOT NULL,
	"photo_verification_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"requires_gps_verification" boolean DEFAULT false NOT NULL,
	"media" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"is_recommended" boolean DEFAULT false NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"tag_id" varchar,
	"theme_id" varchar,
	"listing_id" varchar,
	"title" varchar NOT NULL,
	"description" text,
	"priority" varchar DEFAULT 'medium' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"assignee_type" varchar DEFAULT 'member',
	"assignee_id" varchar,
	"assignee_name" varchar,
	"due_date" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"user_id" varchar,
	"invited_email" varchar,
	"invited_by" varchar,
	"invitation_token" varchar,
	"role" varchar DEFAULT 'member' NOT NULL,
	"status" varchar DEFAULT 'invited' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"name" varchar NOT NULL,
	"icon" varchar,
	"description" text,
	"summary" text,
	"summary_tag_count" integer,
	"summary_generated_at" timestamp,
	"color" varchar,
	"is_system_theme" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"status" varchar NOT NULL,
	"status_code" integer,
	"payload" jsonb,
	"error_message" varchar,
	"reservation_id" varchar,
	"listing_id" varchar,
	"workspace_id" varchar,
	"processing_time_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"user_id" varchar,
	"invited_email" varchar,
	"invited_by" varchar,
	"role" varchar DEFAULT 'member' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"property_management_software" varchar NOT NULL,
	"custom_software_name" varchar,
	"listing_count" varchar,
	"logo_url" text,
	"square_logo_url" text,
	"slack_webhook_url" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profile_photo_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"image_url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" varchar NOT NULL,
	"nav_item_id" varchar NOT NULL,
	"enabled" varchar DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_songs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"workspace_id" varchar,
	"song_type" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"title" varchar,
	"lyrics" text,
	"audio_url" text,
	"prompt" text,
	"music_style" varchar,
	"voice_style" varchar,
	"reservation_id" varchar,
	"shared_on_social" varchar DEFAULT 'false',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"original_selfie_url" text,
	"headshot_locked_at" timestamp,
	"bio" text,
	"role" varchar DEFAULT 'user_staff' NOT NULL,
	"account_type" varchar DEFAULT 'unknown' NOT NULL,
	"default_workspace_id" varchar,
	"timezone" varchar DEFAULT 'America/New_York',
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airbnb_scans" ADD CONSTRAINT "airbnb_scans_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airbnb_scans" ADD CONSTRAINT "airbnb_scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaner_assignments" ADD CONSTRAINT "cleaner_assignments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaner_assignments" ADD CONSTRAINT "cleaner_assignments_cleaner_id_cleaners_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaner_assignments" ADD CONSTRAINT "cleaner_assignments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaner_assignments" ADD CONSTRAINT "cleaner_assignments_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_task_items" ADD CONSTRAINT "cleaning_task_items_cleaning_task_id_cleaning_tasks_id_fk" FOREIGN KEY ("cleaning_task_id") REFERENCES "public"."cleaning_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_cleaner_id_cleaners_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_assigned_member_id_cleaners_id_fk" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."cleaners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_assignment_id_cleaner_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."cleaner_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_items" ADD CONSTRAINT "folder_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_items" ADD CONSTRAINT "folder_items_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_content" ADD CONSTRAINT "generated_content_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_content" ADD CONSTRAINT "generated_content_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_content" ADD CONSTRAINT "generated_content_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_analyses" ADD CONSTRAINT "listing_analyses_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_default_procedure_id_procedures_id_fk" FOREIGN KEY ("default_procedure_id") REFERENCES "public"."procedures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumi_documents" ADD CONSTRAINT "lumi_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumi_documents" ADD CONSTRAINT "lumi_documents_query_id_lumi_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."lumi_queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumi_queries" ADD CONSTRAINT "lumi_queries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumi_queries" ADD CONSTRAINT "lumi_queries_view_id_lumi_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."lumi_views"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumi_views" ADD CONSTRAINT "lumi_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_campaigns" ADD CONSTRAINT "nudge_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_conversations" ADD CONSTRAINT "nudge_conversations_campaign_id_nudge_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."nudge_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_conversations" ADD CONSTRAINT "nudge_conversations_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_conversations" ADD CONSTRAINT "nudge_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_conversations" ADD CONSTRAINT "nudge_conversations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_messages" ADD CONSTRAINT "nudge_messages_conversation_id_nudge_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."nudge_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_analyses" ADD CONSTRAINT "photo_analyses_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_assignments" ADD CONSTRAINT "procedure_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_assignments" ADD CONSTRAINT "procedure_assignments_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_completions" ADD CONSTRAINT "procedure_completions_procedure_assignment_id_procedure_assignments_id_fk" FOREIGN KEY ("procedure_assignment_id") REFERENCES "public"."procedure_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_source_module_id_task_modules_id_fk" FOREIGN KEY ("source_module_id") REFERENCES "public"."task_modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_template_steps" ADD CONSTRAINT "procedure_template_steps_template_id_procedure_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."procedure_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_removal_cases" ADD CONSTRAINT "review_removal_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_removal_cases" ADD CONSTRAINT "review_removal_cases_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_removal_cases" ADD CONSTRAINT "review_removal_cases_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews_summaries" ADD CONSTRAINT "reviews_summaries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speed_test_runs" ADD CONSTRAINT "speed_test_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speed_test_runs" ADD CONSTRAINT "speed_test_runs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_completions" ADD CONSTRAINT "step_completions_procedure_completion_id_procedure_completions_id_fk" FOREIGN KEY ("procedure_completion_id") REFERENCES "public"."procedure_completions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_completions" ADD CONSTRAINT "step_completions_procedure_step_id_procedure_steps_id_fk" FOREIGN KEY ("procedure_step_id") REFERENCES "public"."procedure_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_folder_item_id_folder_items_id_fk" FOREIGN KEY ("folder_item_id") REFERENCES "public"."folder_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_procedure_step_id_procedure_steps_id_fk" FOREIGN KEY ("procedure_step_id") REFERENCES "public"."procedure_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_module_items" ADD CONSTRAINT "task_module_items_module_id_task_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."task_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_modules" ADD CONSTRAINT "task_modules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");