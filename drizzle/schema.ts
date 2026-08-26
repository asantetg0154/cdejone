import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Identity is managed by Manus OAuth. Application access is granted through memberships. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 240 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  country: varchar("country", { length: 80 }).default("Togo").notNull(),
  locale: varchar("locale", { length: 12 }).default("fr-TG").notNull(),
  status: mysqlEnum("status", ["active", "pilot", "archived"]).default("pilot").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const roles = mysqlTable(
  "roles",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    description: text("description"),
    isSystem: boolean("isSystem").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("roles_org_code_unique").on(table.organizationId, table.code),
    index("roles_org_idx").on(table.organizationId),
  ],
);

export const rolePermissions = mysqlTable(
  "rolePermissions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    roleCode: varchar("roleCode", { length: 80 }).notNull(),
    permission: varchar("permission", { length: 120 }).notNull(),
    allowed: boolean("allowed").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("permissions_org_role_key_unique").on(
      table.organizationId,
      table.roleCode,
      table.permission,
    ),
    index("permissions_org_idx").on(table.organizationId),
  ],
);

export const memberships = mysqlTable(
  "memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    userId: int("userId").notNull(),
    roleCode: varchar("roleCode", { length: 80 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("memberships_org_user_unique").on(table.organizationId, table.userId),
    index("memberships_user_idx").on(table.userId),
    index("memberships_org_idx").on(table.organizationId),
  ],
);

export const reportingPeriods = mysqlTable(
  "reportingPeriods",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    code: varchar("code", { length: 24 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    status: mysqlEnum("status", ["open", "closed", "planned"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("periods_org_code_unique").on(table.organizationId, table.code),
    index("periods_org_idx").on(table.organizationId),
  ],
);

export const participants = mysqlTable(
  "participants",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    referenceCode: varchar("referenceCode", { length: 64 }).notNull(),
    displayName: varchar("displayName", { length: 180 }).notNull(),
    birthYear: int("birthYear"),
    status: mysqlEnum("status", ["active", "transition", "alumni", "inactive"]).default("active").notNull(),
    sensitivity: mysqlEnum("sensitivity", ["general", "enfant", "social", "sante"]).default("enfant").notNull(),
    consentStatus: mysqlEnum("consentStatus", ["verified", "pending", "restricted"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("participants_org_reference_unique").on(table.organizationId, table.referenceCode),
    index("participants_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const objectives = mysqlTable(
  "objectives",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    periodId: int("periodId"),
    code: varchar("code", { length: 64 }).notNull(),
    title: varchar("title", { length: 280 }).notNull(),
    description: text("description"),
    ownerName: varchar("ownerName", { length: 180 }),
    status: mysqlEnum("status", ["draft", "active", "at_risk", "achieved", "closed"]).default("draft").notNull(),
    baselineValue: decimal("baselineValue", { precision: 12, scale: 2 }),
    targetValue: decimal("targetValue", { precision: 12, scale: 2 }),
    actualValue: decimal("actualValue", { precision: 12, scale: 2 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("objectives_org_code_unique").on(table.organizationId, table.code),
    index("objectives_org_period_idx").on(table.organizationId, table.periodId),
  ],
);

export const activities = mysqlTable(
  "activities",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    periodId: int("periodId"),
    objectiveId: int("objectiveId"),
    title: varchar("title", { length: 280 }).notNull(),
    programme: varchar("programme", { length: 160 }),
    ownerName: varchar("ownerName", { length: 180 }),
    plannedDate: timestamp("plannedDate"),
    actualDate: timestamp("actualDate"),
    status: mysqlEnum("status", ["planned", "in_progress", "completed", "delayed", "cancelled"]).default("planned").notNull(),
    expectedParticipants: int("expectedParticipants"),
    actualParticipants: int("actualParticipants"),
    budgetPlanned: decimal("budgetPlanned", { precision: 14, scale: 2 }),
    budgetActual: decimal("budgetActual", { precision: 14, scale: 2 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("activities_org_period_idx").on(table.organizationId, table.periodId),
    index("activities_objective_idx").on(table.objectiveId),
  ],
);

export const indicators = mysqlTable(
  "indicators",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    objectiveId: int("objectiveId"),
    code: varchar("code", { length: 64 }).notNull(),
    label: varchar("label", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 80 }).notNull(),
    definition: text("definition"),
    dataSource: varchar("dataSource", { length: 240 }),
    sensitivity: mysqlEnum("sensitivity", ["general", "enfant", "social", "sante", "finance"]).default("general").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("indicators_org_code_unique").on(table.organizationId, table.code),
    index("indicators_objective_idx").on(table.objectiveId),
  ],
);

export const results = mysqlTable(
  "results",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    periodId: int("periodId"),
    activityId: int("activityId"),
    indicatorId: int("indicatorId"),
    level: mysqlEnum("level", ["delivery", "participation", "result", "impact"]).notNull(),
    value: decimal("value", { precision: 14, scale: 2 }).notNull(),
    targetValue: decimal("targetValue", { precision: 14, scale: 2 }),
    notes: text("notes"),
    validationState: mysqlEnum("validationState", ["draft", "submitted", "validated", "rejected"]).default("draft").notNull(),
    validatedByUserId: int("validatedByUserId"),
    validatedAt: timestamp("validatedAt"),
    sourceDocumentId: int("sourceDocumentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("results_org_period_idx").on(table.organizationId, table.periodId),
    index("results_indicator_idx").on(table.indicatorId),
    index("results_validation_idx").on(table.validationState),
  ],
);

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    periodId: int("periodId"),
    originalName: varchar("originalName", { length: 320 }).notNull(),
    storageKey: varchar("storageKey", { length: 520 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 600 }).notNull(),
    mimeType: varchar("mimeType", { length: 160 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    category: mysqlEnum("category", ["plan", "report", "evaluation", "budget", "register", "other"]).default("other").notNull(),
    sensitivity: mysqlEnum("sensitivity", ["general", "enfant", "social", "sante", "finance"]).default("general").notNull(),
    status: mysqlEnum("status", ["received", "review", "validated", "restricted", "archived"]).default("received").notNull(),
    extractedText: text("extractedText"),
    createdByUserId: int("createdByUserId").notNull(),
    validatedByUserId: int("validatedByUserId"),
    validatedAt: timestamp("validatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("documents_org_status_idx").on(table.organizationId, table.status),
    index("documents_org_period_idx").on(table.organizationId, table.periodId),
  ],
);

export const imports = mysqlTable(
  "imports",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    documentId: int("documentId").notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    status: mysqlEnum("status", ["preview", "mapping_review", "validation", "imported", "rejected"]).default("preview").notNull(),
    proposedMapping: json("proposedMapping"),
    previewRows: json("previewRows"),
    anomalyCount: int("anomalyCount").default(0).notNull(),
    duplicateCount: int("duplicateCount").default(0).notNull(),
    importedRows: int("importedRows").default(0).notNull(),
    reviewedByUserId: int("reviewedByUserId"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("imports_org_status_idx").on(table.organizationId, table.status),
    index("imports_document_idx").on(table.documentId),
  ],
);

export const dataQualityIssues = mysqlTable(
  "dataQualityIssues",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    importId: int("importId"),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    fieldName: varchar("fieldName", { length: 120 }),
    severity: mysqlEnum("severity", ["urgent", "important", "information"]).default("information").notNull(),
    issueType: mysqlEnum("issueType", ["missing", "duplicate", "format", "inconsistent", "stale"]).notNull(),
    description: text("description").notNull(),
    status: mysqlEnum("status", ["open", "resolved", "ignored"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  table => [
    index("quality_org_status_idx").on(table.organizationId, table.status),
    index("quality_import_idx").on(table.importId),
  ],
);

export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    title: varchar("title", { length: 280 }).notNull(),
    description: text("description"),
    ownerName: varchar("ownerName", { length: 180 }),
    dueDate: timestamp("dueDate"),
    priority: mysqlEnum("priority", ["urgent", "important", "information"]).default("important").notNull(),
    status: mysqlEnum("status", ["open", "in_progress", "blocked", "completed", "cancelled"]).default("open").notNull(),
    escalationState: mysqlEnum("escalationState", ["none", "due_soon", "overdue", "escalated"]).default("none").notNull(),
    sourceType: varchar("sourceType", { length: 80 }),
    createdByUserId: int("createdByUserId").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("tasks_org_status_due_idx").on(table.organizationId, table.status, table.dueDate)],
);

export const risks = mysqlTable(
  "risks",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    title: varchar("title", { length: 280 }).notNull(),
    description: text("description"),
    probability: mysqlEnum("probability", ["low", "medium", "high"]).notNull(),
    impact: mysqlEnum("impact", ["low", "medium", "high"]).notNull(),
    ownerName: varchar("ownerName", { length: 180 }),
    mitigation: text("mitigation"),
    status: mysqlEnum("status", ["open", "mitigated", "accepted", "closed"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("risks_org_status_idx").on(table.organizationId, table.status)],
);

export const decisions = mysqlTable(
  "decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    title: varchar("title", { length: 280 }).notNull(),
    context: text("context").notNull(),
    recommendation: text("recommendation"),
    rationale: text("rationale"),
    evidence: json("evidence"),
    confidence: mysqlEnum("confidence", ["low", "medium", "high", "insufficient"]).default("insufficient").notNull(),
    decisionState: mysqlEnum("decisionState", ["pending", "accepted", "modified", "rejected"]).default("pending").notNull(),
    decidedByUserId: int("decidedByUserId"),
    decidedAt: timestamp("decidedAt"),
    decisionNote: text("decisionNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("decisions_org_state_idx").on(table.organizationId, table.decisionState)],
);

export const plans = mysqlTable(
  "plans",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    periodId: int("periodId").notNull(),
    title: varchar("title", { length: 280 }).notNull(),
    status: mysqlEnum("status", ["draft", "review", "validated", "archived"]).default("draft").notNull(),
    diagnostic: text("diagnostic"),
    assumptions: json("assumptions"),
    createdByUserId: int("createdByUserId").notNull(),
    validatedByUserId: int("validatedByUserId"),
    validatedAt: timestamp("validatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("plans_org_period_unique").on(table.organizationId, table.periodId)],
);

export const planScenarios = mysqlTable(
  "planScenarios",
  {
    id: int("id").autoincrement().primaryKey(),
    planId: int("planId").notNull(),
    name: mysqlEnum("name", ["conservative", "balanced", "ambitious"]).notNull(),
    summary: text("summary").notNull(),
    budgetAssumption: decimal("budgetAssumption", { precision: 14, scale: 2 }),
    activityCount: int("activityCount").notNull(),
    expectedReach: int("expectedReach"),
    assumptions: json("assumptions"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("scenarios_plan_name_unique").on(table.planId, table.name)],
);

export const reports = mysqlTable(
  "reports",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    periodId: int("periodId"),
    type: mysqlEnum("type", ["monthly", "annual", "meeting"]).notNull(),
    title: varchar("title", { length: 280 }).notNull(),
    content: text("content").notNull(),
    dataBasis: json("dataBasis").notNull(),
    status: mysqlEnum("status", ["draft", "review", "validated", "archived"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    validatedByUserId: int("validatedByUserId"),
    validatedAt: timestamp("validatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("reports_org_type_idx").on(table.organizationId, table.type)],
);

export const assistantInteractions = mysqlTable(
  "assistantInteractions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    userId: int("userId").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    sources: json("sources").notNull(),
    confidence: mysqlEnum("confidence", ["low", "medium", "high", "insufficient"]).default("insufficient").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("assistant_org_user_idx").on(table.organizationId, table.userId)],
);

export const auditLogs = mysqlTable(
  "auditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull(),
    actorUserId: int("actorUserId"),
    action: varchar("action", { length: 160 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    sensitivity: mysqlEnum("sensitivity", ["general", "enfant", "social", "sante", "finance"]).default("general").notNull(),
    previousValue: json("previousValue"),
    nextValue: json("nextValue"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_org_created_idx").on(table.organizationId, table.createdAt), index("audit_entity_idx").on(table.entityType, table.entityId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
