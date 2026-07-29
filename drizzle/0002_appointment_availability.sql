CREATE UNIQUE INDEX IF NOT EXISTS `appointments_slot_unique`
ON `appointments` (`tenant_id`, `barber`, `date`, `time`);
