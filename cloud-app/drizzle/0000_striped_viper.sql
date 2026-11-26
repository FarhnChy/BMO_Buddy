CREATE TABLE `inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barcode` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`expires_on` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_batch` ON `inventory` (`barcode`,`expires_on`);--> statement-breakpoint
CREATE TABLE `readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`temperature_c` real
);
