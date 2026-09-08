CREATE TABLE `catalog_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`catalog_version` text NOT NULL,
	`next_muscle` text,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	`last_error` text,
	CONSTRAINT "catalog_sync_state_singleton" CHECK("catalog_sync_state"."id" = 'catalog')
);
