ALTER TABLE `puzzle` ADD `initial_difficulty` tinyint;--> statement-breakpoint
CREATE INDEX `puzzle_initial_difficulty_idx` ON `puzzle` (`initial_difficulty`);