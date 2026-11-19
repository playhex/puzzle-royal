CREATE TABLE `oauth_token` (
	`player_public_id` char(36) NOT NULL,
	`access_token_enc` text NOT NULL,
	`access_expires_at` datetime NOT NULL,
	`refresh_token_enc` text,
	`scope` varchar(255) NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `oauth_token_player_public_id` PRIMARY KEY(`player_public_id`)
);
--> statement-breakpoint
CREATE TABLE `player` (
	`public_id` char(36) NOT NULL,
	`pseudo` varchar(64) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`is_guest` boolean NOT NULL DEFAULT false,
	`avatar_path` varchar(255),
	`avatar_thumbnail_path` varchar(255),
	`country_flag` varchar(8),
	`rating` double NOT NULL DEFAULT 1500,
	`rating_deviation` double NOT NULL DEFAULT 350,
	`settings` json,
	`profile_synced_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `player_public_id` PRIMARY KEY(`public_id`)
);
--> statement-breakpoint
CREATE TABLE `player_stats` (
	`player_public_id` char(36) NOT NULL,
	`games_played` int NOT NULL DEFAULT 0,
	`wins` int NOT NULL DEFAULT 0,
	`puzzles_solved` int NOT NULL DEFAULT 0,
	`opponents_survived_total` int NOT NULL DEFAULT 0,
	CONSTRAINT `player_stats_player_public_id` PRIMARY KEY(`player_public_id`)
);
--> statement-breakpoint
CREATE TABLE `player_survived_opponent` (
	`player_public_id` char(36) NOT NULL,
	`opponent_public_id` char(36) NOT NULL,
	`opponent_pseudo` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `player_survived_opponent_player_public_id_opponent_public_id_pk` PRIMARY KEY(`player_public_id`,`opponent_public_id`)
);
--> statement-breakpoint
CREATE TABLE `puzzle` (
	`id` int AUTO_INCREMENT NOT NULL,
	`red_stones` varchar(255) NOT NULL,
	`blue_stones` varchar(255) NOT NULL,
	`last_move` varchar(4),
	`solution` varchar(4) NOT NULL,
	`imported_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `puzzle_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `puzzle_stats` (
	`puzzle_id` int NOT NULL,
	`times_shown` int NOT NULL DEFAULT 0,
	`players_present` int NOT NULL DEFAULT 0,
	`rounds_with_elimination` int NOT NULL DEFAULT 0,
	`players_eliminated` int NOT NULL DEFAULT 0,
	`rounds_all_fell` int NOT NULL DEFAULT 0,
	`rounds_none_fell` int NOT NULL DEFAULT 0,
	`survivor_reach_ms_sum` bigint NOT NULL DEFAULT 0,
	`survivor_reach_count` int NOT NULL DEFAULT 0,
	`eliminated_rating_sum` double NOT NULL DEFAULT 0,
	`survivor_rating_sum` double NOT NULL DEFAULT 0,
	`survivors_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `puzzle_stats_puzzle_id` PRIMARY KEY(`puzzle_id`)
);
--> statement-breakpoint
CREATE TABLE `puzzle_wrong_cell` (
	`puzzle_id` int NOT NULL,
	`cell` varchar(4) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `puzzle_wrong_cell_puzzle_id_cell_pk` PRIMARY KEY(`puzzle_id`,`cell`)
);
--> statement-breakpoint
CREATE TABLE `replay_game` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_id` char(36) NOT NULL,
	`started_at` datetime(3) NOT NULL,
	`ended_at` datetime(3) NOT NULL,
	`seed` int NOT NULL,
	`config` json NOT NULL,
	`players_count` smallint NOT NULL,
	`rounds_count` smallint NOT NULL,
	CONSTRAINT `replay_game_id` PRIMARY KEY(`id`),
	CONSTRAINT `replay_game_public_id_unique` UNIQUE(`public_id`)
);
--> statement-breakpoint
CREATE TABLE `replay_inputs` (
	`game_id` int NOT NULL,
	`inputs` json NOT NULL,
	CONSTRAINT `replay_inputs_game_id` PRIMARY KEY(`game_id`)
);
--> statement-breakpoint
CREATE TABLE `replay_player` (
	`game_id` int NOT NULL,
	`idx` tinyint NOT NULL,
	`player_public_id` char(36) NOT NULL,
	`pseudo` varchar(64) NOT NULL,
	`avatar_url` varchar(512),
	`country_flag` varchar(8),
	`rating` double NOT NULL,
	`rating_deviation` double NOT NULL,
	`start_x` int NOT NULL,
	`start_y` int NOT NULL,
	`eliminated_round` smallint,
	`final_place` smallint NOT NULL,
	CONSTRAINT `replay_player_game_id_idx_pk` PRIMARY KEY(`game_id`,`idx`)
);
--> statement-breakpoint
CREATE TABLE `replay_round` (
	`game_id` int NOT NULL,
	`round_index` smallint NOT NULL,
	`puzzle_id` int NOT NULL,
	`origin_cell` varchar(4),
	`appear_ms` int NOT NULL,
	`play_ms` int NOT NULL,
	`drop_ms` int NOT NULL,
	`end_ms` int NOT NULL,
	`alive_before` smallint NOT NULL,
	`eliminated_count` smallint NOT NULL,
	CONSTRAINT `replay_round_game_id_round_index_pk` PRIMARY KEY(`game_id`,`round_index`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id_hash` char(64) NOT NULL,
	`player_public_id` char(36) NOT NULL,
	`created_at` datetime NOT NULL,
	`expires_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	CONSTRAINT `session_id_hash` PRIMARY KEY(`id_hash`)
);
--> statement-breakpoint
ALTER TABLE `oauth_token` ADD CONSTRAINT `oauth_token_player_public_id_player_public_id_fk` FOREIGN KEY (`player_public_id`) REFERENCES `player`(`public_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_stats` ADD CONSTRAINT `player_stats_player_public_id_player_public_id_fk` FOREIGN KEY (`player_public_id`) REFERENCES `player`(`public_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_survived_opponent` ADD CONSTRAINT `player_survived_opponent_player_public_id_player_public_id_fk` FOREIGN KEY (`player_public_id`) REFERENCES `player`(`public_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `puzzle_stats` ADD CONSTRAINT `puzzle_stats_puzzle_id_puzzle_id_fk` FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `puzzle_wrong_cell` ADD CONSTRAINT `puzzle_wrong_cell_puzzle_id_puzzle_id_fk` FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `replay_inputs` ADD CONSTRAINT `replay_inputs_game_id_replay_game_id_fk` FOREIGN KEY (`game_id`) REFERENCES `replay_game`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `replay_player` ADD CONSTRAINT `replay_player_game_id_replay_game_id_fk` FOREIGN KEY (`game_id`) REFERENCES `replay_game`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `replay_player` ADD CONSTRAINT `replay_player_player_public_id_player_public_id_fk` FOREIGN KEY (`player_public_id`) REFERENCES `player`(`public_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `replay_round` ADD CONSTRAINT `replay_round_game_id_replay_game_id_fk` FOREIGN KEY (`game_id`) REFERENCES `replay_game`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `replay_round` ADD CONSTRAINT `replay_round_puzzle_id_puzzle_id_fk` FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_player_public_id_player_public_id_fk` FOREIGN KEY (`player_public_id`) REFERENCES `player`(`public_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `replay_game_ended_at_idx` ON `replay_game` (`ended_at`);--> statement-breakpoint
CREATE INDEX `replay_player_player_idx` ON `replay_player` (`player_public_id`);--> statement-breakpoint
CREATE INDEX `session_player_idx` ON `session` (`player_public_id`);