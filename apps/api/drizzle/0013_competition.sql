CREATE TABLE `rival` (
	`user_id` text NOT NULL,
	`rival_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `rival_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rival_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rival_not_self" CHECK("rival"."user_id" <> "rival"."rival_user_id")
);
--> statement-breakpoint
ALTER TABLE `user` ADD `competes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `is_admin` integer DEFAULT false NOT NULL;