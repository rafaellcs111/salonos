ALTER TABLE `barbers` ADD `work_start` text NOT NULL DEFAULT '09:00';
ALTER TABLE `barbers` ADD `work_end` text NOT NULL DEFAULT '18:00';
ALTER TABLE `barbers` ADD `break_start` text NOT NULL DEFAULT '';
ALTER TABLE `barbers` ADD `break_end` text NOT NULL DEFAULT '';
ALTER TABLE `barbers` ADD `time_off` text NOT NULL DEFAULT '[]';
