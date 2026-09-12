CREATE TABLE `device_link` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_link_user_id_idx` ON `device_link` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`challenge` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`pending_user_id` text,
	`display_name` text,
	`locale` text,
	`invitation_hash` text,
	`device_link_hash` text,
	FOREIGN KEY (`invitation_hash`) REFERENCES `invitation`(`code_hash`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_link_hash`) REFERENCES `device_link`(`code_hash`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_challenge_ceremony_complete" CHECK("__new_auth_challenge"."kind" = 'authentication' or ("__new_auth_challenge"."kind" = 'registration' and "__new_auth_challenge"."pending_user_id" is not null and "__new_auth_challenge"."display_name" is not null and "__new_auth_challenge"."locale" is not null and "__new_auth_challenge"."invitation_hash" is not null) or ("__new_auth_challenge"."kind" = 'device_link' and "__new_auth_challenge"."pending_user_id" is not null and "__new_auth_challenge"."device_link_hash" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_auth_challenge`("id", "kind", "challenge", "created_at", "expires_at", "pending_user_id", "display_name", "locale", "invitation_hash", "device_link_hash") SELECT "id", "kind", "challenge", "created_at", "expires_at", "pending_user_id", "display_name", "locale", "invitation_hash", NULL FROM `auth_challenge`;--> statement-breakpoint
DROP TABLE `auth_challenge`;--> statement-breakpoint
ALTER TABLE `__new_auth_challenge` RENAME TO `auth_challenge`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `auth_challenge_expires_at_idx` ON `auth_challenge` (`expires_at`);