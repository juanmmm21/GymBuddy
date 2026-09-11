DROP TABLE `login_nonce`;--> statement-breakpoint
DROP INDEX `user_telegram_user_id_unique`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `telegram_user_id`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `first_name`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `username`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `photo_url`;