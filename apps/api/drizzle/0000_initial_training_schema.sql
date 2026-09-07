CREATE TABLE `catalog_exercise` (
	`catalog_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`muscle` text NOT NULL,
	`body_part` text NOT NULL,
	`equipment` text NOT NULL,
	`category` text NOT NULL,
	`secondary_muscles` text NOT NULL,
	`gif_url` text NOT NULL,
	`name_es` text NOT NULL,
	`name_en` text NOT NULL,
	`instructions_es` text NOT NULL,
	`instructions_en` text NOT NULL,
	`search_text` text NOT NULL,
	`catalog_version` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_exercise_body_part_idx` ON `catalog_exercise` (`body_part`);--> statement-breakpoint
CREATE INDEX `catalog_exercise_muscle_idx` ON `catalog_exercise` (`muscle`);--> statement-breakpoint
CREATE INDEX `catalog_exercise_search_text_idx` ON `catalog_exercise` (`search_text`);--> statement-breakpoint
CREATE TABLE `login_nonce` (
	`nonce` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_nonce_expires_at_idx` ON `login_nonce` (`expires_at`);--> statement-breakpoint
CREATE TABLE `personal_record` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tracked_exercise_id` text NOT NULL,
	`kind` text NOT NULL,
	`value_grams` integer NOT NULL,
	`set_entry_id` text NOT NULL,
	`achieved_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_exercise_id`) REFERENCES `tracked_exercise`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_entry_id`) REFERENCES `set_entry`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `personal_record_exercise_kind_idx` ON `personal_record` (`tracked_exercise_id`,`kind`);--> statement-breakpoint
CREATE INDEX `personal_record_user_achieved_idx` ON `personal_record` (`user_id`,`achieved_at`);--> statement-breakpoint
CREATE TABLE `routine` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_user_id_idx` ON `routine` (`user_id`);--> statement-breakpoint
CREATE TABLE `routine_item` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`tracked_exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`target_sets` integer NOT NULL,
	`target_reps_min` integer NOT NULL,
	`target_reps_max` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_exercise_id`) REFERENCES `tracked_exercise`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "routine_item_target_sets_positive" CHECK("routine_item"."target_sets" > 0),
	CONSTRAINT "routine_item_rep_range_ordered" CHECK("routine_item"."target_reps_min" > 0 and "routine_item"."target_reps_max" >= "routine_item"."target_reps_min")
);
--> statement-breakpoint
CREATE INDEX `routine_item_routine_order_idx` ON `routine_item` (`routine_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `set_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`tracked_exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`weight_grams` integer NOT NULL,
	`reps` integer NOT NULL,
	`rpe_tenths` integer,
	`is_warmup` integer DEFAULT false NOT NULL,
	`completed_at` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_exercise_id`) REFERENCES `tracked_exercise`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "set_entry_weight_non_negative" CHECK("set_entry"."weight_grams" >= 0),
	CONSTRAINT "set_entry_reps_positive" CHECK("set_entry"."reps" > 0),
	CONSTRAINT "set_entry_rpe_range" CHECK("set_entry"."rpe_tenths" is null or ("set_entry"."rpe_tenths" between 10 and 100 and "set_entry"."rpe_tenths" % 5 = 0))
);
--> statement-breakpoint
CREATE INDEX `set_entry_session_order_idx` ON `set_entry` (`session_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `set_entry_exercise_completed_idx` ON `set_entry` (`tracked_exercise_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `tracked_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`catalog_id` text,
	`custom_name` text,
	`custom_muscle` text,
	`custom_body_part` text,
	`notes` text,
	`created_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog_exercise`(`catalog_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tracked_exercise_source_present" CHECK("tracked_exercise"."catalog_id" is not null or "tracked_exercise"."custom_name" is not null)
);
--> statement-breakpoint
CREATE INDEX `tracked_exercise_user_id_idx` ON `tracked_exercise` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_exercise_user_catalog_unique` ON `tracked_exercise` (`user_id`,`catalog_id`) WHERE "tracked_exercise"."catalog_id" is not null;--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`telegram_user_id` integer NOT NULL,
	`first_name` text NOT NULL,
	`username` text,
	`photo_url` text,
	`locale` text DEFAULT 'es' NOT NULL,
	`unit_system` text DEFAULT 'metric' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_telegram_user_id_unique` ON `user` (`telegram_user_id`);--> statement-breakpoint
CREATE TABLE `workout_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`notes` text,
	`source` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_session_user_started_idx` ON `workout_session` (`user_id`,`started_at`);