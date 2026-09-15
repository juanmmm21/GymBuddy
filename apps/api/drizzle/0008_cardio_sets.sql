-- Series de cardio: `set_entry` gana el tipo, la duración y la distancia, y el peso y las
-- repeticiones pasan a admitir nulo. SQLite no deja quitar un NOT NULL, así que la tabla se
-- reconstruye.
--
-- Escrita a mano y no como la genera drizzle-kit: D1 aplica siempre las claves ajenas (el
-- `PRAGMA foreign_keys=OFF` no hace nada dentro de su transacción), y un `DROP TABLE set_entry`
-- con `personal_record` colgando de ella por `on delete cascade` borraría todas las marcas.
-- Las marcas se apartan a una tabla sin claves ajenas, se reconstruye `set_entry` sin nadie
-- que dependa de ella y se devuelven con su tabla recreada tal cual era.
CREATE TABLE `__personal_record_backup` AS SELECT * FROM `personal_record`;--> statement-breakpoint
DROP TABLE `personal_record`;--> statement-breakpoint
CREATE TABLE `__new_set_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`tracked_exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`kind` text DEFAULT 'strength' NOT NULL,
	`weight_grams` integer,
	`reps` integer,
	`duration_seconds` integer,
	`distance_meters` integer,
	`rpe_tenths` integer,
	`is_warmup` integer DEFAULT false NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracked_exercise_id`) REFERENCES `tracked_exercise`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "set_entry_weight_non_negative" CHECK("weight_grams" >= 0),
	CONSTRAINT "set_entry_reps_positive" CHECK("reps" > 0),
	CONSTRAINT "set_entry_duration_positive" CHECK("duration_seconds" > 0),
	CONSTRAINT "set_entry_distance_positive" CHECK("distance_meters" > 0),
	CONSTRAINT "set_entry_kind_shape" CHECK(("kind" = 'strength' and "weight_grams" is not null and "reps" is not null and "duration_seconds" is null and "distance_meters" is null) or ("kind" = 'cardio' and "duration_seconds" is not null and "weight_grams" is null and "reps" is null)),
	CONSTRAINT "set_entry_rpe_range" CHECK("rpe_tenths" is null or ("rpe_tenths" between 10 and 100 and "rpe_tenths" % 5 = 0))
);
--> statement-breakpoint
INSERT INTO `__new_set_entry`("id", "session_id", "tracked_exercise_id", "order_index", "kind", "weight_grams", "reps", "duration_seconds", "distance_meters", "rpe_tenths", "is_warmup", "completed_at") SELECT "id", "session_id", "tracked_exercise_id", "order_index", 'strength', "weight_grams", "reps", NULL, NULL, "rpe_tenths", "is_warmup", "completed_at" FROM `set_entry`;--> statement-breakpoint
DROP TABLE `set_entry`;--> statement-breakpoint
ALTER TABLE `__new_set_entry` RENAME TO `set_entry`;--> statement-breakpoint
CREATE INDEX `set_entry_session_order_idx` ON `set_entry` (`session_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `set_entry_exercise_completed_idx` ON `set_entry` (`tracked_exercise_id`,`completed_at`);--> statement-breakpoint
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
INSERT INTO `personal_record`("id", "user_id", "tracked_exercise_id", "kind", "value_grams", "set_entry_id", "achieved_at") SELECT "id", "user_id", "tracked_exercise_id", "kind", "value_grams", "set_entry_id", "achieved_at" FROM `__personal_record_backup`;--> statement-breakpoint
DROP TABLE `__personal_record_backup`;--> statement-breakpoint
CREATE INDEX `personal_record_exercise_kind_idx` ON `personal_record` (`tracked_exercise_id`,`kind`);--> statement-breakpoint
CREATE INDEX `personal_record_user_achieved_idx` ON `personal_record` (`user_id`,`achieved_at`);
