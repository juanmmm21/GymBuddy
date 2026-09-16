CREATE TABLE `exercise_media` (
	`tracked_exercise_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`tracked_exercise_id`) REFERENCES `tracked_exercise`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "exercise_media_bytes_positive" CHECK("exercise_media"."bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE `media_upload_month` (
	`month` text PRIMARY KEY NOT NULL,
	`uploads` integer NOT NULL,
	CONSTRAINT "media_upload_month_uploads_positive" CHECK("media_upload_month"."uploads" > 0)
);
