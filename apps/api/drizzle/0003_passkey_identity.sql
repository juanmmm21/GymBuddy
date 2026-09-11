CREATE TABLE `auth_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`challenge` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`pending_user_id` text,
	`display_name` text,
	`locale` text,
	`invitation_hash` text,
	FOREIGN KEY (`invitation_hash`) REFERENCES `invitation`(`code_hash`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_challenge_registration_complete" CHECK("auth_challenge"."kind" = 'authentication' or ("auth_challenge"."pending_user_id" is not null and "auth_challenge"."display_name" is not null and "auth_challenge"."locale" is not null and "auth_challenge"."invitation_hash" is not null))
);
--> statement-breakpoint
CREATE INDEX `auth_challenge_expires_at_idx` ON `auth_challenge` (`expires_at`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`used_by_user_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invitation_created_by_idx` ON `invitation` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `passkey_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`backed_up` integer NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "passkey_credential_counter_non_negative" CHECK("passkey_credential"."counter" >= 0)
);
--> statement-breakpoint
CREATE INDEX `passkey_credential_user_id_idx` ON `passkey_credential` (`user_id`);--> statement-breakpoint
-- Escrito a mano: SQLite no añade una columna NOT NULL sin valor por defecto a una tabla con
-- filas, y la D1 local ya las tiene. El nombre visible arranca con el nombre de Telegram.
ALTER TABLE `user` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `user` SET `display_name` = `first_name`;