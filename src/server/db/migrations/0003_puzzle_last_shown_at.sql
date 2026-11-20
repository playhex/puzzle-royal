ALTER TABLE `puzzle` ADD `last_shown_at` datetime;--> statement-breakpoint
CREATE INDEX `puzzle_last_shown_at_idx` ON `puzzle` (`last_shown_at`);