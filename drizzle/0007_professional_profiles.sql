ALTER TABLE `barbers` ADD `email` text NOT NULL DEFAULT '';
ALTER TABLE `barbers` ADD `phone` text NOT NULL DEFAULT '';
ALTER TABLE `barbers` ADD `role` text NOT NULL DEFAULT 'Barbeiro';
ALTER TABLE `barbers` ADD `services` text NOT NULL DEFAULT '[]';
ALTER TABLE `barbers` ADD `work_days` text NOT NULL DEFAULT '["2","3","4","5","6"]';
ALTER TABLE `barbers` ADD `permissions` text NOT NULL DEFAULT '{"agenda":true,"clients":true,"finance":false,"settings":false}';
