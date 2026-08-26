CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`periodId` int,
	`objectiveId` int,
	`title` varchar(280) NOT NULL,
	`programme` varchar(160),
	`ownerName` varchar(180),
	`plannedDate` timestamp,
	`actualDate` timestamp,
	`status` enum('planned','in_progress','completed','delayed','cancelled') NOT NULL DEFAULT 'planned',
	`expectedParticipants` int,
	`actualParticipants` int,
	`budgetPlanned` decimal(14,2),
	`budgetActual` decimal(14,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assistantInteractions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`sources` json NOT NULL,
	`confidence` enum('low','medium','high','insufficient') NOT NULL DEFAULT 'insufficient',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistantInteractions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(160) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`sensitivity` enum('general','enfant','social','sante','finance') NOT NULL DEFAULT 'general',
	`previousValue` json,
	`nextValue` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dataQualityIssues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`importId` int,
	`entityType` varchar(80) NOT NULL,
	`fieldName` varchar(120),
	`severity` enum('urgent','important','information') NOT NULL DEFAULT 'information',
	`issueType` enum('missing','duplicate','format','inconsistent','stale') NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','resolved','ignored') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `dataQualityIssues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`title` varchar(280) NOT NULL,
	`context` text NOT NULL,
	`recommendation` text,
	`rationale` text,
	`evidence` json,
	`confidence` enum('low','medium','high','insufficient') NOT NULL DEFAULT 'insufficient',
	`decisionState` enum('pending','accepted','modified','rejected') NOT NULL DEFAULT 'pending',
	`decidedByUserId` int,
	`decidedAt` timestamp,
	`decisionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`periodId` int,
	`originalName` varchar(320) NOT NULL,
	`storageKey` varchar(520) NOT NULL,
	`storageUrl` varchar(600) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`sizeBytes` int NOT NULL,
	`category` enum('plan','report','evaluation','budget','register','other') NOT NULL DEFAULT 'other',
	`sensitivity` enum('general','enfant','social','sante','finance') NOT NULL DEFAULT 'general',
	`status` enum('received','review','validated','restricted','archived') NOT NULL DEFAULT 'received',
	`extractedText` text,
	`createdByUserId` int NOT NULL,
	`validatedByUserId` int,
	`validatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`documentId` int NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`status` enum('preview','mapping_review','validation','imported','rejected') NOT NULL DEFAULT 'preview',
	`proposedMapping` json,
	`previewRows` json,
	`anomalyCount` int NOT NULL DEFAULT 0,
	`duplicateCount` int NOT NULL DEFAULT 0,
	`importedRows` int NOT NULL DEFAULT 0,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`objectiveId` int,
	`code` varchar(64) NOT NULL,
	`label` varchar(240) NOT NULL,
	`unit` varchar(80) NOT NULL,
	`definition` text,
	`dataSource` varchar(240),
	`sensitivity` enum('general','enfant','social','sante','finance') NOT NULL DEFAULT 'general',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `indicators_id` PRIMARY KEY(`id`),
	CONSTRAINT `indicators_org_code_unique` UNIQUE(`organizationId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`roleCode` varchar(80) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberships_org_user_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`periodId` int,
	`code` varchar(64) NOT NULL,
	`title` varchar(280) NOT NULL,
	`description` text,
	`ownerName` varchar(180),
	`status` enum('draft','active','at_risk','achieved','closed') NOT NULL DEFAULT 'draft',
	`baselineValue` decimal(12,2),
	`targetValue` decimal(12,2),
	`actualValue` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `objectives_id` PRIMARY KEY(`id`),
	CONSTRAINT `objectives_org_code_unique` UNIQUE(`organizationId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(240) NOT NULL,
	`code` varchar(32) NOT NULL,
	`country` varchar(80) NOT NULL DEFAULT 'Togo',
	`locale` varchar(12) NOT NULL DEFAULT 'fr-TG',
	`status` enum('active','pilot','archived') NOT NULL DEFAULT 'pilot',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`referenceCode` varchar(64) NOT NULL,
	`displayName` varchar(180) NOT NULL,
	`birthYear` int,
	`status` enum('active','transition','alumni','inactive') NOT NULL DEFAULT 'active',
	`sensitivity` enum('general','enfant','social','sante') NOT NULL DEFAULT 'enfant',
	`consentStatus` enum('verified','pending','restricted') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `participants_org_reference_unique` UNIQUE(`organizationId`,`referenceCode`)
);
--> statement-breakpoint
CREATE TABLE `planScenarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`name` enum('conservative','balanced','ambitious') NOT NULL,
	`summary` text NOT NULL,
	`budgetAssumption` decimal(14,2),
	`activityCount` int NOT NULL,
	`expectedReach` int,
	`assumptions` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `planScenarios_id` PRIMARY KEY(`id`),
	CONSTRAINT `scenarios_plan_name_unique` UNIQUE(`planId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`periodId` int NOT NULL,
	`title` varchar(280) NOT NULL,
	`status` enum('draft','review','validated','archived') NOT NULL DEFAULT 'draft',
	`diagnostic` text,
	`assumptions` json,
	`createdByUserId` int NOT NULL,
	`validatedByUserId` int,
	`validatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_org_period_unique` UNIQUE(`organizationId`,`periodId`)
);
--> statement-breakpoint
CREATE TABLE `reportingPeriods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`code` varchar(24) NOT NULL,
	`label` varchar(120) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`status` enum('open','closed','planned') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reportingPeriods_id` PRIMARY KEY(`id`),
	CONSTRAINT `periods_org_code_unique` UNIQUE(`organizationId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`periodId` int,
	`type` enum('monthly','annual','meeting') NOT NULL,
	`title` varchar(280) NOT NULL,
	`content` text NOT NULL,
	`dataBasis` json NOT NULL,
	`status` enum('draft','review','validated','archived') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`validatedByUserId` int,
	`validatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`periodId` int,
	`activityId` int,
	`indicatorId` int,
	`level` enum('delivery','participation','result','impact') NOT NULL,
	`value` decimal(14,2) NOT NULL,
	`targetValue` decimal(14,2),
	`notes` text,
	`validationState` enum('draft','submitted','validated','rejected') NOT NULL DEFAULT 'draft',
	`validatedByUserId` int,
	`validatedAt` timestamp,
	`sourceDocumentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`title` varchar(280) NOT NULL,
	`description` text,
	`probability` enum('low','medium','high') NOT NULL,
	`impact` enum('low','medium','high') NOT NULL,
	`ownerName` varchar(180),
	`mitigation` text,
	`status` enum('open','mitigated','accepted','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rolePermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`roleCode` varchar(80) NOT NULL,
	`permission` varchar(120) NOT NULL,
	`allowed` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rolePermissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_org_role_key_unique` UNIQUE(`organizationId`,`roleCode`,`permission`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`code` varchar(80) NOT NULL,
	`label` varchar(120) NOT NULL,
	`description` text,
	`isSystem` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_org_code_unique` UNIQUE(`organizationId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`title` varchar(280) NOT NULL,
	`description` text,
	`ownerName` varchar(180),
	`dueDate` timestamp,
	`priority` enum('urgent','important','information') NOT NULL DEFAULT 'important',
	`status` enum('open','in_progress','blocked','completed','cancelled') NOT NULL DEFAULT 'open',
	`escalationState` enum('none','due_soon','overdue','escalated') NOT NULL DEFAULT 'none',
	`sourceType` varchar(80),
	`createdByUserId` int NOT NULL,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `activities_org_period_idx` ON `activities` (`organizationId`,`periodId`);--> statement-breakpoint
CREATE INDEX `activities_objective_idx` ON `activities` (`objectiveId`);--> statement-breakpoint
CREATE INDEX `assistant_org_user_idx` ON `assistantInteractions` (`organizationId`,`userId`);--> statement-breakpoint
CREATE INDEX `audit_org_created_idx` ON `auditLogs` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `auditLogs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `quality_org_status_idx` ON `dataQualityIssues` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `quality_import_idx` ON `dataQualityIssues` (`importId`);--> statement-breakpoint
CREATE INDEX `decisions_org_state_idx` ON `decisions` (`organizationId`,`decisionState`);--> statement-breakpoint
CREATE INDEX `documents_org_status_idx` ON `documents` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `documents_org_period_idx` ON `documents` (`organizationId`,`periodId`);--> statement-breakpoint
CREATE INDEX `imports_org_status_idx` ON `imports` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `imports_document_idx` ON `imports` (`documentId`);--> statement-breakpoint
CREATE INDEX `indicators_objective_idx` ON `indicators` (`objectiveId`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`userId`);--> statement-breakpoint
CREATE INDEX `memberships_org_idx` ON `memberships` (`organizationId`);--> statement-breakpoint
CREATE INDEX `objectives_org_period_idx` ON `objectives` (`organizationId`,`periodId`);--> statement-breakpoint
CREATE INDEX `participants_org_status_idx` ON `participants` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `periods_org_idx` ON `reportingPeriods` (`organizationId`);--> statement-breakpoint
CREATE INDEX `reports_org_type_idx` ON `reports` (`organizationId`,`type`);--> statement-breakpoint
CREATE INDEX `results_org_period_idx` ON `results` (`organizationId`,`periodId`);--> statement-breakpoint
CREATE INDEX `results_indicator_idx` ON `results` (`indicatorId`);--> statement-breakpoint
CREATE INDEX `results_validation_idx` ON `results` (`validationState`);--> statement-breakpoint
CREATE INDEX `risks_org_status_idx` ON `risks` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `permissions_org_idx` ON `rolePermissions` (`organizationId`);--> statement-breakpoint
CREATE INDEX `roles_org_idx` ON `roles` (`organizationId`);--> statement-breakpoint
CREATE INDEX `tasks_org_status_due_idx` ON `tasks` (`organizationId`,`status`,`dueDate`);