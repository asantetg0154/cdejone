import { and, desc, eq, inArray, lt } from "drizzle-orm";
import * as XLSX from "xlsx";
import {
  activities,
  assistantInteractions,
  auditLogs,
  dataQualityIssues,
  decisions,
  documents,
  imports,
  memberships,
  objectives,
  organizations,
  participants,
  planScenarios,
  plans,
  reportingPeriods,
  reports,
  results,
  risks,
  rolePermissions,
  roles,
  tasks,
  type User,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

export type Workspace = {
  organizationId: number;
  organizationName: string;
  roleCode: string;
  userId: number;
};

export function assertTenantScope(workspace: Workspace, entity: { organizationId: number }) {
  if (entity.organizationId !== workspace.organizationId) {
    throw new Error("Accès inter-organisation refusé.");
  }
}

export function enforceGroundedAnswer(answer: string, sources: Array<{ type: string; label: string; id: number }>) {
  const trimmed = answer.trim() || "Données insuffisantes pour conclure avec fiabilité.";
  const basis = sources.length
    ? sources.slice(0, 8).map(source => `- ${source.type} : ${source.label}`).join("\n")
    : "- Aucune source autorisée et validée n’est disponible.";
  const withBasis = trimmed.includes("Base examinée") ? trimmed : `${trimmed}\n\n## Base examinée\n${basis}`;
  return withBasis.includes("Limites et validation humaine")
    ? withBasis
    : `${withBasis}\n\n## Limites et validation humaine\nCette réponse est une aide à l’analyse. Elle ne constitue pas une décision et doit être examinée par une personne habilitée.`;
}

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  administrateur: ["*"],
  responsable: [
    "dashboard.read",
    "data.read",
    "document.import",
    "document.validate",
    "planning.read",
    "planning.write",
    "workflow.read",
    "workflow.write",
    "decision.approve",
    "report.read",
    "report.write",
    "assistant.ask",
  ],
  coordinateur: [
    "dashboard.read",
    "data.read",
    "data.write",
    "document.import",
    "planning.read",
    "planning.write",
    "workflow.read",
    "workflow.write",
    "report.read",
    "report.write",
    "assistant.ask",
  ],
  animateur: ["dashboard.read", "data.read", "data.write", "workflow.read", "assistant.ask"],
  lecture: ["dashboard.read", "data.read", "planning.read", "workflow.read", "report.read", "assistant.ask"],
};

const ROLE_SENSITIVITY: Record<string, Array<"general" | "enfant" | "social" | "sante" | "finance">> = {
  administrateur: ["general", "enfant", "social", "sante", "finance"],
  responsable: ["general", "enfant", "finance"],
  coordinateur: ["general", "enfant", "finance"],
  animateur: ["general", "enfant"],
  lecture: ["general"],
};

const ROLE_CATALOGUE = [
  { code: "administrateur", label: "Administrateur système", description: "Gère la configuration, les rôles et les droits de l’organisation." },
  { code: "responsable", label: "Responsable", description: "Valide les décisions, documents et plans qui nécessitent une approbation humaine." },
  { code: "coordinateur", label: "Coordinateur CDEJ", description: "Pilote les activités, la planification, les données et les workflows." },
  { code: "animateur", label: "Animateur", description: "Contribue aux données et consulte les éléments utiles au terrain." },
  { code: "lecture", label: "Lecture seule", description: "Consulte les informations autorisées sans les modifier." },
];

function insertId(result: unknown): number {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Number((candidate as { insertId?: number }).insertId ?? 0);
}

export async function ensureWorkspace(user: User): Promise<Workspace> {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");

  const current = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.isActive, true)))
    .limit(1);

  if (current[0]) {
    const organization = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, current[0].organizationId))
      .limit(1);
    if (organization[0]) {
      return {
        organizationId: organization[0].id,
        organizationName: organization[0].name,
        roleCode: current[0].roleCode,
        userId: user.id,
      };
    }
  }

  const code = `CDEJ-${String(user.id).padStart(4, "0")}`;
  const orgResult = await db.insert(organizations).values({
    name: `CDEJ Pilote — ${user.name || "Organisation"}`,
    code,
    status: "pilot",
  });
  const organizationId = insertId(orgResult);
  if (!organizationId) throw new Error("Impossible de créer l’organisation pilote.");

  await db.insert(roles).values(
    ROLE_CATALOGUE.map(role => ({
      organizationId,
      ...role,
      isSystem: true,
    })),
  );
  await db.insert(rolePermissions).values(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).flatMap(([roleCode, permissions]) =>
      permissions.map(permission => ({ organizationId, roleCode, permission, allowed: true })),
    ),
  );
  await db.insert(memberships).values({ organizationId, userId: user.id, roleCode: "administrateur" });
  await writeAudit({ organizationId, actorUserId: user.id, action: "organization.created", entityType: "organization", entityId: organizationId });

  return {
    organizationId,
    organizationName: `CDEJ Pilote — ${user.name || "Organisation"}`,
    roleCode: "administrateur",
    userId: user.id,
  };
}

export async function hasPermission(workspace: Workspace, permission: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const configured = await db
    .select()
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.organizationId, workspace.organizationId),
        eq(rolePermissions.roleCode, workspace.roleCode),
        inArray(rolePermissions.permission, [permission, "*"]),
      ),
    );
  if (configured.some(item => item.permission === permission || item.permission === "*")) {
    return configured.some(item => item.allowed);
  }
  const defaults = DEFAULT_ROLE_PERMISSIONS[workspace.roleCode] ?? [];
  return defaults.includes("*") || defaults.includes(permission);
}

export function authorizedSensitivities(workspace: Workspace) {
  return ROLE_SENSITIVITY[workspace.roleCode] ?? ["general"];
}

export async function writeAudit(input: {
  organizationId: number;
  actorUserId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  sensitivity?: "general" | "enfant" | "social" | "sante" | "finance";
  previousValue?: unknown;
  nextValue?: unknown;
  metadata?: unknown;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    sensitivity: input.sensitivity ?? "general",
    previousValue: input.previousValue,
    nextValue: input.nextValue,
    metadata: input.metadata,
  });
}

export async function getDashboard(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const now = new Date();
  const [participantRows, activityRows, taskRows, riskRows, issueRows, resultRows, decisionRows, documentRows] = await Promise.all([
    db.select().from(participants).where(eq(participants.organizationId, workspace.organizationId)),
    db.select().from(activities).where(eq(activities.organizationId, workspace.organizationId)),
    db.select().from(tasks).where(eq(tasks.organizationId, workspace.organizationId)),
    db.select().from(risks).where(and(eq(risks.organizationId, workspace.organizationId), eq(risks.status, "open"))),
    db.select().from(dataQualityIssues).where(and(eq(dataQualityIssues.organizationId, workspace.organizationId), eq(dataQualityIssues.status, "open"))),
    db.select().from(results).where(and(eq(results.organizationId, workspace.organizationId), eq(results.validationState, "validated"))),
    db.select().from(decisions).where(and(eq(decisions.organizationId, workspace.organizationId), eq(decisions.decisionState, "pending"))),
    db.select().from(documents).where(eq(documents.organizationId, workspace.organizationId)),
  ]);

  const overdue = taskRows.filter(task => task.status !== "completed" && task.dueDate && task.dueDate < now);
  const completedActivities = activityRows.filter(item => item.status === "completed").length;
  const plannedActivities = activityRows.filter(item => item.status !== "cancelled").length;
  const totalResultScore = resultRows.length
    ? resultRows.reduce((sum, item) => sum + Number(item.targetValue ? Number(item.value) / Number(item.targetValue) : 0), 0) / resultRows.length
    : 0;
  const qualityScore = documentRows.length || issueRows.length ? Math.max(0, Math.min(100, 100 - issueRows.length * 7)) : 0;

  const attention = [
    ...overdue.map(task => ({
      id: `task-${task.id}`,
      level: "urgent" as const,
      title: "Action en retard",
      detail: `${task.title}${task.ownerName ? ` — responsable : ${task.ownerName}` : ""}`,
      action: "Voir le workflow",
    })),
    ...riskRows
      .filter(risk => risk.impact === "high" || risk.probability === "high")
      .map(risk => ({ id: `risk-${risk.id}`, level: "important" as const, title: "Risque à surveiller", detail: risk.title, action: "Ouvrir les risques" })),
    ...decisionRows.map(decision => ({
      id: `decision-${decision.id}`,
      level: "important" as const,
      title: "Validation humaine requise",
      detail: decision.title,
      action: "Examiner la décision",
    })),
    ...issueRows.slice(0, 3).map(issue => ({
      id: `quality-${issue.id}`,
      level: issue.severity,
      title: "Qualité des données",
      detail: issue.description,
      action: "Vérifier l’import",
    })),
  ].slice(0, 8);

  return {
    organizationName: workspace.organizationName,
    roleCode: workspace.roleCode,
    metrics: {
      participants: participantRows.length,
      activities: { completed: completedActivities, planned: plannedActivities },
      dataQuality: qualityScore,
      executionRate: plannedActivities ? Math.round((completedActivities / plannedActivities) * 100) : 0,
      resultProgress: Math.round(totalResultScore * 100),
      overdueWork: overdue.length,
      openRisks: riskRows.length,
      pendingDecisions: decisionRows.length,
    },
    attention,
    limitation:
      resultRows.length === 0
        ? "Aucun résultat validé n’est encore disponible pour calculer une progression ou une tendance fiable."
        : issueRows.length > 0
          ? `${issueRows.length} problème(s) de qualité ouvert(s) limitent certaines analyses.`
          : "Les indicateurs affichés reposent sur les données validées disponibles.",
  };
}

export async function getDataHub(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const sensitivities = authorizedSensitivities(workspace);
  const [periods, participantRows, activityRows, objectiveRows, documentRows, taskRows, riskRows, decisionRows] = await Promise.all([
    db.select().from(reportingPeriods).where(eq(reportingPeriods.organizationId, workspace.organizationId)).orderBy(desc(reportingPeriods.endDate)),
    db.select().from(participants).where(eq(participants.organizationId, workspace.organizationId)).orderBy(desc(participants.updatedAt)).limit(10),
    db.select().from(activities).where(eq(activities.organizationId, workspace.organizationId)).orderBy(desc(activities.updatedAt)).limit(10),
    db.select().from(objectives).where(eq(objectives.organizationId, workspace.organizationId)).orderBy(desc(objectives.updatedAt)).limit(10),
    db.select().from(documents).where(and(eq(documents.organizationId, workspace.organizationId), inArray(documents.sensitivity, sensitivities))).orderBy(desc(documents.createdAt)).limit(10),
    db.select().from(tasks).where(eq(tasks.organizationId, workspace.organizationId)).orderBy(desc(tasks.updatedAt)).limit(10),
    db.select().from(risks).where(eq(risks.organizationId, workspace.organizationId)).orderBy(desc(risks.updatedAt)).limit(10),
    db.select().from(decisions).where(eq(decisions.organizationId, workspace.organizationId)).orderBy(desc(decisions.createdAt)).limit(10),
  ]);
  return { periods, participants: participantRows, activities: activityRows, objectives: objectiveRows, documents: documentRows, tasks: taskRows, risks: riskRows, decisions: decisionRows };
}

export async function getAnalytics(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const [periods, validResults, issueRows, activityRows] = await Promise.all([
    db.select().from(reportingPeriods).where(eq(reportingPeriods.organizationId, workspace.organizationId)).orderBy(reportingPeriods.startDate),
    db.select().from(results).where(and(eq(results.organizationId, workspace.organizationId), eq(results.validationState, "validated"))),
    db.select().from(dataQualityIssues).where(and(eq(dataQualityIssues.organizationId, workspace.organizationId), eq(dataQualityIssues.status, "open"))),
    db.select().from(activities).where(eq(activities.organizationId, workspace.organizationId)),
  ]);
  const levels = ["delivery", "participation", "result", "impact"] as const;
  const cards = levels.map(level => {
    const items = validResults.filter(result => result.level === level);
    const value = items.length ? items.reduce((sum, item) => sum + Number(item.value), 0) / items.length : 0;
    const target = items.length ? items.reduce((sum, item) => sum + Number(item.targetValue ?? 0), 0) / items.length : 0;
    return { level, value: Math.round(value * 10) / 10, target: Math.round(target * 10) / 10, count: items.length };
  });
  const timeline = periods.map(period => {
    const items = validResults.filter(result => result.periodId === period.id);
    const aggregate = items.length ? items.reduce((sum, item) => sum + Number(item.value), 0) / items.length : 0;
    return { label: period.code, value: Math.round(aggregate * 10) / 10 };
  });
  const participation = activityRows.filter(activity => activity.expectedParticipants && activity.actualParticipants).map(activity => ({
    name: activity.title,
    planned: activity.expectedParticipants ?? 0,
    actual: activity.actualParticipants ?? 0,
  }));
  return {
    cards,
    timeline,
    participation,
    limitations: [
      ...(validResults.length < 4 ? ["Échantillon de résultats validés encore limité : les comparaisons doivent être interprétées avec prudence."] : []),
      ...(issueRows.length ? [`${issueRows.length} anomalie(s) de qualité ouverte(s) peuvent affecter les analyses.`] : []),
      ...(!periods.length ? ["Aucune période historique structurée n’est encore disponible."] : []),
    ],
  };
}

export async function getPlanning(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const periods = await db.select().from(reportingPeriods).where(eq(reportingPeriods.organizationId, workspace.organizationId)).orderBy(desc(reportingPeriods.endDate));
  const targetPeriod = periods.find(period => period.status === "planned") ?? periods[0];
  const plan = targetPeriod
    ? (await db.select().from(plans).where(and(eq(plans.organizationId, workspace.organizationId), eq(plans.periodId, targetPeriod.id))).limit(1))[0]
    : undefined;
  const scenarios = plan ? await db.select().from(planScenarios).where(eq(planScenarios.planId, plan.id)) : [];
  const objectiveRows = await db.select().from(objectives).where(eq(objectives.organizationId, workspace.organizationId));
  const activityRows = await db.select().from(activities).where(eq(activities.organizationId, workspace.organizationId));
  const validResults = await db.select().from(results).where(and(eq(results.organizationId, workspace.organizationId), eq(results.validationState, "validated")));
  const qualityIssues = await db.select().from(dataQualityIssues).where(and(eq(dataQualityIssues.organizationId, workspace.organizationId), eq(dataQualityIssues.status, "open")));
  const diagnostic = plan?.diagnostic ?? buildDiagnostic({ objectiveRows, activityRows, validResults, qualityIssues });
  return {
    targetPeriod,
    plan: plan ?? { title: targetPeriod ? `Préparer ${targetPeriod.code}` : "Planification à initialiser", status: "draft", diagnostic },
    scenarios,
    objectives: objectiveRows,
    activities: activityRows,
    diagnostic,
    limitations: qualityIssues.length ? [`${qualityIssues.length} problème(s) de qualité doivent être traités avant validation du plan.`] : ["Le diagnostic s’appuie uniquement sur les résultats et activités déjà validés."],
  };
}

export function buildDiagnostic(input: { objectiveRows: Array<{ status: string; title: string }>; activityRows: Array<{ status: string; title: string }>; validResults: Array<{ level: string; value: string }>; qualityIssues: unknown[] }) {
  const delayed = input.activityRows.filter(activity => activity.status === "delayed").length;
  const completed = input.activityRows.filter(activity => activity.status === "completed").length;
  const measuredResults = input.validResults.filter(result => result.level === "result").length;
  return `Diagnostic préparatoire : ${completed} activité(s) finalisée(s), ${delayed} activité(s) en retard et ${measuredResults} résultat(s) validé(s) sont actuellement disponibles. ${input.qualityIssues.length ? "Des anomalies de données restent à examiner avant toute décision définitive." : "Les propositions doivent être revues et validées par un responsable habilité."}`;
}

export async function getWorkflow(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const [taskRows, decisionRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.organizationId, workspace.organizationId)).orderBy(desc(tasks.updatedAt)),
    db.select().from(decisions).where(eq(decisions.organizationId, workspace.organizationId)).orderBy(desc(decisions.createdAt)),
  ]);
  return { tasks: taskRows, decisions: decisionRows };
}

export async function getReports(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  return db.select().from(reports).where(eq(reports.organizationId, workspace.organizationId)).orderBy(desc(reports.updatedAt));
}

const fieldAliases: Record<string, string[]> = {
  referenceCode: ["reference", "référence", "code", "identifiant", "id participant"],
  displayName: ["nom", "nom complet", "participant", "bénéficiaire", "beneficiaire", "nom prénom"],
  birthYear: ["année naissance", "annee naissance", "birth year", "année de naissance"],
  title: ["activité", "activite", "titre", "nom activité", "nom activite"],
  expectedParticipants: ["participants prévus", "participants prevus", "effectif prévu", "effectif prevu"],
  actualParticipants: ["participants réels", "participants reels", "effectif réel", "effectif reel"],
  ownerName: ["responsable", "porteur", "animateur"],
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function mappingForHeaders(headers: string[]) {
  const output: Record<string, string | null> = {};
  for (const [target, aliases] of Object.entries(fieldAliases)) {
    output[target] = headers.find(header => aliases.some(alias => normalized(header).includes(alias))) ?? null;
  }
  return output;
}

function prepareSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [] as string[], rows: [] as Record<string, unknown>[] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
  const headers = (matrix[0] ?? []).map(header => String(header).trim()).filter(Boolean);
  const rows = matrix.slice(1, 21).filter(row => row.some(cell => String(cell ?? "").trim())).map(row =>
    headers.reduce<Record<string, unknown>>((entry, header, index) => {
      entry[header] = row[index] ?? "";
      return entry;
    }, {}),
  );
  return { headers, rows };
}

async function extractText(buffer: Buffer, mimeType: string, fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || /\.(xlsx|xls|csv)$/i.test(lowerName)) {
    const prepared = prepareSpreadsheet(buffer);
    return { text: JSON.stringify(prepared.rows.slice(0, 8)), prepared };
  }
  if (mimeType.includes("wordprocessingml") || /\.docx$/i.test(lowerName)) {
    try {
      const mammoth = (await import("mammoth")) as unknown as { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> };
      const extracted = await mammoth.extractRawText({ buffer });
      return { text: extracted.value.slice(0, 18000), prepared: { headers: [], rows: [] as Record<string, unknown>[] } };
    } catch {
      return { text: "Extraction Word indisponible : le document reste disponible pour une revue manuelle.", prepared: { headers: [], rows: [] as Record<string, unknown>[] } };
    }
  }
  if (mimeType.includes("pdf") || /\.pdf$/i.test(lowerName)) {
    try {
      const module = (await import("pdf-parse")) as unknown as { PDFParse?: new (input: { data: Buffer }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } };
      if (module.PDFParse) {
        const parser = new module.PDFParse({ data: buffer });
        const extracted = await parser.getText();
        await parser.destroy();
        return { text: extracted.text.slice(0, 18000), prepared: { headers: [], rows: [] as Record<string, unknown>[] } };
      }
    } catch {
      // A manual review remains available even when extraction cannot be completed.
    }
    return { text: "Extraction PDF à vérifier manuellement. Le document est conservé avec sa provenance.", prepared: { headers: [], rows: [] as Record<string, unknown>[] } };
  }
  return { text: "Format reçu. Une revue manuelle peut être nécessaire avant exploitation.", prepared: { headers: [], rows: [] as Record<string, unknown>[] } };
}

export function guessEntity(mapping: Record<string, string | null>) {
  return mapping.referenceCode || mapping.displayName ? "participant" : mapping.title ? "activity" : "document";
}

export async function uploadAndPrepareImport(
  workspace: Workspace,
  input: { fileName: string; mimeType: string; contentBase64: string; category: "plan" | "report" | "evaluation" | "budget" | "register" | "other"; sensitivity: "general" | "enfant" | "social" | "sante" | "finance"; periodId?: number },
) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const buffer = Buffer.from(input.contentBase64, "base64");
  if (!buffer.length) throw new Error("Le fichier reçu est vide.");
  if (buffer.length > 7 * 1024 * 1024) throw new Error("Le fichier dépasse la limite de 7 Mo pour la prévisualisation sécurisée.");
  const permitted = authorizedSensitivities(workspace);
  if (!permitted.includes(input.sensitivity)) throw new Error("Vous n’êtes pas autorisé à importer ce niveau de données sensibles.");

  const stored = await storagePut(`cdej/${workspace.organizationId}/imports/${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`, buffer, input.mimeType);
  const extraction = await extractText(buffer, input.mimeType, input.fileName);
  const mapping = mappingForHeaders(extraction.prepared.headers);
  const entityType = guessEntity(mapping);
  const anomalies: Array<{ type: "missing" | "duplicate" | "format"; field?: string; description: string; severity: "urgent" | "important" | "information" }> = [];
  const referenceValues = extraction.prepared.rows.map(row => mapping.referenceCode ? normalized(row[mapping.referenceCode]) : "").filter(Boolean);
  const duplicateCount = referenceValues.length - new Set(referenceValues).size;
  if (entityType === "participant" && (!mapping.referenceCode || !mapping.displayName)) {
    anomalies.push({ type: "missing", description: "Le mapping participant nécessite au minimum une référence et un nom affiché.", severity: "important" });
  }
  if (duplicateCount) anomalies.push({ type: "duplicate", description: `${duplicateCount} doublon(s) potentiel(s) ont été détectés dans la prévisualisation.`, severity: "important" });
  if (extraction.prepared.rows.length === 0 && extraction.prepared.headers.length === 0) {
    anomalies.push({ type: "format", description: "Aucun tableau structuré détecté. Une revue manuelle du document est requise.", severity: "information" });
  }

  const documentResult = await db.insert(documents).values({
    organizationId: workspace.organizationId,
    periodId: input.periodId,
    originalName: input.fileName,
    storageKey: stored.key,
    storageUrl: stored.url,
    mimeType: input.mimeType,
    sizeBytes: buffer.length,
    category: input.category,
    sensitivity: input.sensitivity,
    status: "review",
    extractedText: extraction.text,
    createdByUserId: workspace.userId,
  });
  const documentId = insertId(documentResult);
  const importResult = await db.insert(imports).values({
    organizationId: workspace.organizationId,
    documentId,
    entityType,
    status: "validation",
    proposedMapping: mapping,
    previewRows: extraction.prepared.rows,
    anomalyCount: anomalies.length,
    duplicateCount,
  });
  const importId = insertId(importResult);
  if (anomalies.length) {
    await db.insert(dataQualityIssues).values(anomalies.map(issue => ({
      organizationId: workspace.organizationId,
      importId,
      entityType,
      fieldName: issue.field,
      severity: issue.severity,
      issueType: issue.type,
      description: issue.description,
    })));
  }
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "import.prepared", entityType: "import", entityId: importId, sensitivity: input.sensitivity, metadata: { documentId, mapping, anomalyCount: anomalies.length } });
  return { importId, documentId, entityType, mapping, previewRows: extraction.prepared.rows, anomalies, duplicateCount, provenance: { fileName: input.fileName, storageUrl: stored.url, receivedAt: new Date() } };
}

export async function confirmImport(workspace: Workspace, importId: number) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const current = await db.select().from(imports).where(and(eq(imports.id, importId), eq(imports.organizationId, workspace.organizationId))).limit(1);
  if (!current[0]) throw new Error("Import introuvable ou non autorisé.");
  const item = current[0];
  assertTenantScope(workspace, item);
  const mapping = (item.proposedMapping ?? {}) as Record<string, string | null>;
  const previewRows = Array.isArray(item.previewRows) ? item.previewRows as Array<Record<string, unknown>> : [];
  let importedRows = 0;
  if (item.entityType === "participant" && mapping.referenceCode && mapping.displayName) {
    for (const row of previewRows) {
      const referenceCode = String(row[mapping.referenceCode] ?? "").trim();
      const displayName = String(row[mapping.displayName] ?? "").trim();
      if (!referenceCode || !displayName) continue;
      const birthYear = mapping.birthYear ? Number(row[mapping.birthYear]) : undefined;
      await db.insert(participants).values({
        organizationId: workspace.organizationId,
        referenceCode,
        displayName,
        birthYear: Number.isFinite(birthYear) ? birthYear : null,
        consentStatus: "pending",
      }).onDuplicateKeyUpdate({ set: { displayName, birthYear: Number.isFinite(birthYear) ? birthYear : null, updatedAt: new Date() } });
      importedRows += 1;
    }
  }
  if (item.entityType === "activity" && mapping.title) {
    for (const row of previewRows) {
      const title = String(row[mapping.title] ?? "").trim();
      if (!title) continue;
      await db.insert(activities).values({
        organizationId: workspace.organizationId,
        title,
        ownerName: mapping.ownerName ? String(row[mapping.ownerName] ?? "").trim() || null : null,
        expectedParticipants: mapping.expectedParticipants ? Number(row[mapping.expectedParticipants]) || null : null,
        actualParticipants: mapping.actualParticipants ? Number(row[mapping.actualParticipants]) || null : null,
      });
      importedRows += 1;
    }
  }
  await db.update(imports).set({ status: "imported", importedRows, reviewedByUserId: workspace.userId, reviewedAt: new Date() }).where(eq(imports.id, item.id));
  await db.update(documents).set({ status: "validated", validatedByUserId: workspace.userId, validatedAt: new Date() }).where(eq(documents.id, item.documentId));
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "import.confirmed", entityType: "import", entityId: importId, metadata: { importedRows } });
  return { importedRows };
}

export async function setTaskStatus(workspace: Workspace, taskId: number, status: "open" | "in_progress" | "blocked" | "completed" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const current = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, workspace.organizationId))).limit(1);
  if (!current[0]) throw new Error("Tâche introuvable ou non autorisée.");
  assertTenantScope(workspace, current[0]);
  await db.update(tasks).set({ status, completedAt: status === "completed" ? new Date() : null }).where(eq(tasks.id, taskId));
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "task.status_changed", entityType: "task", entityId: taskId, previousValue: { status: current[0].status }, nextValue: { status } });
  return { success: true };
}

export async function decide(workspace: Workspace, decisionId: number, state: "accepted" | "modified" | "rejected", note: string) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const current = await db.select().from(decisions).where(and(eq(decisions.id, decisionId), eq(decisions.organizationId, workspace.organizationId))).limit(1);
  if (!current[0]) throw new Error("Décision introuvable ou non autorisée.");
  assertTenantScope(workspace, current[0]);
  await db.update(decisions).set({ decisionState: state, decisionNote: note, decidedByUserId: workspace.userId, decidedAt: new Date() }).where(eq(decisions.id, decisionId));
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "decision.human_validated", entityType: "decision", entityId: decisionId, previousValue: { state: current[0].decisionState }, nextValue: { state, note } });
  return { success: true };
}

export async function updateReportContent(workspace: Workspace, reportId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const current = await db.select().from(reports).where(and(eq(reports.id, reportId), eq(reports.organizationId, workspace.organizationId))).limit(1);
  if (!current[0]) throw new Error("Brouillon introuvable ou non autorisé.");
  assertTenantScope(workspace, current[0]);
  await db.update(reports).set({ content, status: "review" }).where(eq(reports.id, reportId));
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "report.updated", entityType: "report", entityId: reportId, previousValue: { status: current[0].status }, nextValue: { status: "review" } });
  return { success: true };
}

export async function generateVerifiedReport(workspace: Workspace, type: "monthly" | "annual" | "meeting") {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const { context, sources } = await groundedContext(workspace);
  if (!context.results.length && !context.documents.length) {
    throw new Error("Données insuffisantes pour générer un brouillon fiable. Validez d’abord des résultats ou documents autorisés.");
  }
  const latestPeriod = (await db.select().from(reportingPeriods).where(eq(reportingPeriods.organizationId, workspace.organizationId)).orderBy(desc(reportingPeriods.endDate)).limit(1))[0];
  const resultLines = context.results.length
    ? context.results.map(result => `- ${result.level} : ${result.value}${result.target ? ` (cible : ${result.target})` : ""}${result.notes ? ` — ${result.notes}` : ""}`).join("\n")
    : "- Aucun résultat validé n’est disponible.";
  const documentLines = context.documents.length
    ? context.documents.map(document => `- ${document.name} (${document.category})`).join("\n")
    : "- Aucun document validé n’a été mobilisé.";
  const title = type === "meeting" ? "Préparation de réunion" : type === "annual" ? "Brouillon de rapport annuel" : "Brouillon de rapport mensuel";
  const content = type === "meeting"
    ? `# ${title}\n\n## Éléments factuels à examiner\n${resultLines}\n\n## Documents validés disponibles\n${documentLines}\n\n## Décisions humaines attendues\n- Examiner les écarts et limites identifiés.\n- Confirmer les responsables et échéances.\n\n> Ce brouillon est généré exclusivement à partir de sources validées autorisées. Toute décision doit être validée par une personne habilitée.`
    : `# ${title}\n\n## Données validées disponibles\n${resultLines}\n\n## Documents de référence validés\n${documentLines}\n\n## Limites\nLes données manquantes ou non validées ne sont pas utilisées dans ce brouillon. Toute interprétation et toute décision exigent une revue humaine.`;
  const result = await db.insert(reports).values({
    organizationId: workspace.organizationId,
    periodId: latestPeriod?.id,
    type,
    title: `${title}${latestPeriod ? ` — ${latestPeriod.code}` : ""}`,
    content,
    dataBasis: sources.slice(0, 24),
    status: "draft",
    createdByUserId: workspace.userId,
  });
  const reportId = insertId(result);
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "report.generated_from_validated_data", entityType: "report", entityId: reportId, metadata: { sourceCount: sources.length, type } });
  return { reportId, content };
}

export async function updateScenario(workspace: Workspace, scenarioId: number, input: { summary: string; budgetAssumption?: string; activityCount: number; expectedReach?: number; assumptions: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const current = await db.select().from(planScenarios).where(eq(planScenarios.id, scenarioId)).limit(1);
  if (!current[0]) throw new Error("Scénario introuvable.");
  const parent = await db.select().from(plans).where(and(eq(plans.id, current[0].planId), eq(plans.organizationId, workspace.organizationId))).limit(1);
  if (!parent[0]) throw new Error("Scénario non autorisé pour cette organisation.");
  await db.update(planScenarios).set({
    summary: input.summary,
    budgetAssumption: input.budgetAssumption ?? null,
    activityCount: input.activityCount,
    expectedReach: input.expectedReach ?? null,
    assumptions: input.assumptions,
  }).where(eq(planScenarios.id, scenarioId));
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "planning.scenario_updated", entityType: "planScenario", entityId: scenarioId, previousValue: current[0], nextValue: input });
  return { success: true };
}

export async function seedDemo(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const existing = await db.select().from(reportingPeriods).where(eq(reportingPeriods.organizationId, workspace.organizationId)).limit(1);
  if (existing.length) return { seeded: false, message: "Des données existent déjà dans cet espace CDEJ." };
  const periodInserts = await db.insert(reportingPeriods).values([
    { organizationId: workspace.organizationId, code: "FY26", label: "Exercice FY26 — démonstration fictive", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30"), status: "closed" },
    { organizationId: workspace.organizationId, code: "FY27", label: "Exercice FY27 — démonstration fictive", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), status: "open" },
    { organizationId: workspace.organizationId, code: "FY28", label: "Exercice FY28 — à préparer", startDate: new Date("2027-07-01"), endDate: new Date("2028-06-30"), status: "planned" },
  ]);
  const firstPeriodId = insertId(periodInserts);
  const periodRows = await db.select().from(reportingPeriods).where(eq(reportingPeriods.organizationId, workspace.organizationId)).orderBy(reportingPeriods.startDate);
  const fy26 = periodRows[0];
  const fy27 = periodRows[1];
  const fy28 = periodRows[2];
  if (!fy26 || !fy27 || !fy28 || !firstPeriodId) throw new Error("Impossible de préparer les périodes de démonstration.");

  await db.insert(participants).values([
    { organizationId: workspace.organizationId, referenceCode: "DEMO-001", displayName: "Participant fictif A", birthYear: 2012, consentStatus: "verified" },
    { organizationId: workspace.organizationId, referenceCode: "DEMO-002", displayName: "Participant fictif B", birthYear: 2010, status: "transition", consentStatus: "verified" },
    { organizationId: workspace.organizationId, referenceCode: "DEMO-003", displayName: "Participant fictif C", birthYear: 2013, consentStatus: "verified" },
  ]);
  const objectiveResult = await db.insert(objectives).values([
    { organizationId: workspace.organizationId, periodId: fy27.id, code: "OBJ-FOR-01", title: "Renforcer la participation aux activités éducatives", ownerName: "Coordinateur démonstration", status: "active", baselineValue: "64", targetValue: "80", actualValue: "72" },
    { organizationId: workspace.organizationId, periodId: fy27.id, code: "OBJ-TRA-01", title: "Préparer les jeunes en transition", ownerName: "Référent transition", status: "at_risk", baselineValue: "40", targetValue: "75", actualValue: "48" },
  ]);
  const firstObjectiveId = insertId(objectiveResult);
  await db.insert(activities).values([
    { organizationId: workspace.organizationId, periodId: fy27.id, objectiveId: firstObjectiveId, title: "Ateliers de soutien scolaire — démonstration", programme: "Éducation", ownerName: "Animateur démonstration", plannedDate: new Date("2027-03-10"), actualDate: new Date("2027-03-10"), status: "completed", expectedParticipants: 40, actualParticipants: 36, budgetPlanned: "180000", budgetActual: "168000" },
    { organizationId: workspace.organizationId, periodId: fy27.id, objectiveId: firstObjectiveId, title: "Forum orientation — démonstration", programme: "Transition", ownerName: "Référent transition", plannedDate: new Date("2027-04-20"), status: "delayed", expectedParticipants: 28, actualParticipants: 0, budgetPlanned: "250000" },
    { organizationId: workspace.organizationId, periodId: fy26.id, title: "Campagne lecture — démonstration", programme: "Éducation", ownerName: "Animateur démonstration", status: "completed", expectedParticipants: 35, actualParticipants: 33, budgetPlanned: "130000", budgetActual: "122000" },
  ]);
  await db.insert(objectives).values([
    { organizationId: workspace.organizationId, periodId: fy28.id, code: "OBJ-FY28-EDU", title: "Proposition FY28 : consolider la participation éducative", ownerName: "Coordinateur démonstration", status: "draft", baselineValue: "72", targetValue: "80" },
    { organizationId: workspace.organizationId, periodId: fy28.id, code: "OBJ-FY28-TRA", title: "Proposition FY28 : renforcer la préparation à la transition", ownerName: "Référent transition", status: "draft", baselineValue: "48", targetValue: "70" },
  ]);
  await db.insert(activities).values([
    { organizationId: workspace.organizationId, periodId: fy28.id, title: "Proposition FY28 : ateliers éducatifs renforcés", programme: "Éducation", ownerName: "Animateur démonstration", status: "planned", expectedParticipants: 45, budgetPlanned: "210000" },
    { organizationId: workspace.organizationId, periodId: fy28.id, title: "Proposition FY28 : parcours de transition et mentorat", programme: "Transition", ownerName: "Référent transition", status: "planned", expectedParticipants: 30, budgetPlanned: "350000" },
  ]);
  await db.insert(results).values([
    { organizationId: workspace.organizationId, periodId: fy26.id, level: "delivery", value: "91", targetValue: "100", notes: "Taux d’activités réalisées — démonstration fictive.", validationState: "validated", validatedByUserId: workspace.userId, validatedAt: new Date() },
    { organizationId: workspace.organizationId, periodId: fy26.id, level: "participation", value: "84", targetValue: "80", notes: "Participation moyenne — démonstration fictive.", validationState: "validated", validatedByUserId: workspace.userId, validatedAt: new Date() },
    { organizationId: workspace.organizationId, periodId: fy27.id, level: "delivery", value: "76", targetValue: "100", notes: "Exécution à mi-parcours — démonstration fictive.", validationState: "validated", validatedByUserId: workspace.userId, validatedAt: new Date() },
    { organizationId: workspace.organizationId, periodId: fy27.id, level: "result", value: "58", targetValue: "75", notes: "Résultat intermédiaire — démonstration fictive.", validationState: "validated", validatedByUserId: workspace.userId, validatedAt: new Date() },
  ]);
  await db.insert(tasks).values([
    { organizationId: workspace.organizationId, title: "Valider la liste des jeunes en transition", ownerName: "Référent transition", dueDate: new Date("2027-02-14"), priority: "urgent", status: "open", escalationState: "overdue", sourceType: "planification", createdByUserId: workspace.userId },
    { organizationId: workspace.organizationId, title: "Contrôler les écarts du budget éducatif", ownerName: "Comptabilité", dueDate: new Date("2027-04-08"), priority: "important", status: "in_progress", escalationState: "due_soon", sourceType: "budget", createdByUserId: workspace.userId },
  ]);
  await db.insert(risks).values([
    { organizationId: workspace.organizationId, title: "Participation des adolescents en baisse", description: "Signal de démonstration fictif à confirmer sur les données terrain.", probability: "high", impact: "medium", ownerName: "Coordinateur démonstration", mitigation: "Préparer une analyse qualitative avant de réviser les activités.", status: "open" },
    { organizationId: workspace.organizationId, title: "Retard du forum d’orientation", description: "Échéance à revoir avec le partenaire concerné.", probability: "medium", impact: "high", ownerName: "Référent transition", mitigation: "Fixer une nouvelle date et confirmer les intervenants.", status: "open" },
  ]);
  await db.insert(decisions).values({
    organizationId: workspace.organizationId,
    title: "Arbitrer le scénario FY28 à soumettre au responsable",
    context: "Le scénario équilibré maintient les activités prioritaires tout en réduisant la pression budgétaire. Données de démonstration fictives.",
    recommendation: "Examiner puis accepter, modifier ou rejeter le scénario équilibré.",
    rationale: "Les résultats disponibles sont intermédiaires et deux actions sont en retard.",
    evidence: [{ type: "result", label: "Résultat intermédiaire FY27" }, { type: "activity", label: "Forum orientation — démonstration" }],
    confidence: "medium",
  });
  const planResult = await db.insert(plans).values({
    organizationId: workspace.organizationId,
    periodId: fy28.id,
    title: "Préparation FY28 — démonstration fictive",
    status: "review",
    diagnostic: "Les informations fictives disponibles indiquent une exécution intermédiaire, une participation globalement stable et un besoin de renforcer la préparation à la transition. Cette synthèse exige une validation humaine avant emploi réel.",
    assumptions: ["Données exclusivement fictives", "Budget de référence FY27 disponible", "Validation responsable obligatoire"],
    createdByUserId: workspace.userId,
  });
  const planId = insertId(planResult);
  await db.insert(planScenarios).values([
    { planId, name: "conservative", summary: "Maintenir les activités essentielles et reporter les actions non critiques.", budgetAssumption: "450000", activityCount: 4, expectedReach: 58, assumptions: ["Budget réduit de 15 %", "Renforcement du suivi des activités existantes"] },
    { planId, name: "balanced", summary: "Maintenir les activités prioritaires et renforcer la préparation à la transition.", budgetAssumption: "560000", activityCount: 6, expectedReach: 72, assumptions: ["Budget stabilisé", "Forum d’orientation reprogrammé"] },
    { planId, name: "ambitious", summary: "Étendre les activités d’orientation et ajouter un dispositif de mentorat.", budgetAssumption: "690000", activityCount: 8, expectedReach: 88, assumptions: ["Partenariat complémentaire", "Capacité d’animation renforcée"] },
  ]);
  await db.insert(reports).values([
    { organizationId: workspace.organizationId, periodId: fy27.id, type: "monthly", title: "Brouillon de rapport mensuel — démonstration fictive", content: "# Rapport de suivi FY27\n\nCe brouillon s’appuie exclusivement sur les données fictives validées disponibles.\n\n## Réalisation\nUne activité éducative a été finalisée ; le forum d’orientation est en retard.\n\n## Résultats\nLes résultats disponibles restent intermédiaires. Une analyse complémentaire est requise avant conclusion.\n\n## Décisions à valider\nExaminer le scénario équilibré de préparation FY28.", dataBasis: [{ source: "results", state: "validated", count: 4 }, { source: "activities", state: "available", count: 3 }], status: "review", createdByUserId: workspace.userId },
    { organizationId: workspace.organizationId, periodId: fy27.id, type: "meeting", title: "Préparation de réunion — démonstration fictive", content: "# Ordre du jour proposé\n\n1. Examiner les actions en retard.\n2. Valider ou modifier la proposition FY28.\n3. Attribuer les responsables et les échéances.\n\n> Les éléments ci-dessus sont basés sur des données fictives de démonstration.", dataBasis: [{ source: "tasks", state: "available", count: 2 }, { source: "decisions", state: "pending", count: 1 }], status: "draft", createdByUserId: workspace.userId },
  ]);
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "demo.seeded", entityType: "organization", entityId: workspace.organizationId, metadata: { fictional: true } });
  return { seeded: true, message: "Les données de démonstration fictives ont été créées." };
}

export async function groundedContext(workspace: Workspace) {
  const db = await getDb();
  if (!db) throw new Error("La base de données n’est pas disponible.");
  const sensitivities = authorizedSensitivities(workspace);
  const [validResults, visibleDocuments, activityRows, taskRows, riskRows, planRows] = await Promise.all([
    db.select().from(results).where(and(eq(results.organizationId, workspace.organizationId), eq(results.validationState, "validated"))).limit(30),
    db.select().from(documents).where(and(eq(documents.organizationId, workspace.organizationId), eq(documents.status, "validated"), inArray(documents.sensitivity, sensitivities))).limit(12),
    db.select().from(activities).where(eq(activities.organizationId, workspace.organizationId)).limit(30),
    db.select().from(tasks).where(eq(tasks.organizationId, workspace.organizationId)).limit(30),
    db.select().from(risks).where(and(eq(risks.organizationId, workspace.organizationId), eq(risks.status, "open"))).limit(20),
    db.select().from(plans).where(and(eq(plans.organizationId, workspace.organizationId), inArray(plans.status, ["review", "validated"]))).limit(5),
  ]);
  const sources = [
    ...validResults.map(result => ({ type: "résultat validé", label: `${result.level} — période ${result.periodId ?? "non précisée"}`, id: result.id })),
    ...visibleDocuments.map(document => ({ type: "document validé", label: document.originalName, id: document.id })),
    ...activityRows.map(activity => ({ type: "activité", label: activity.title, id: activity.id })),
    ...taskRows.map(task => ({ type: "tâche", label: task.title, id: task.id })),
    ...riskRows.map(risk => ({ type: "risque", label: risk.title, id: risk.id })),
    ...planRows.map(plan => ({ type: "plan", label: plan.title, id: plan.id })),
  ];
  const context = {
    results: validResults.map(result => ({ level: result.level, value: result.value, target: result.targetValue, notes: result.notes })),
    documents: visibleDocuments.map(document => ({ name: document.originalName, category: document.category, extractedText: document.extractedText?.slice(0, 1800) ?? "" })),
    activities: activityRows.map(activity => ({ title: activity.title, status: activity.status, expectedParticipants: activity.expectedParticipants, actualParticipants: activity.actualParticipants, budgetPlanned: activity.budgetPlanned, budgetActual: activity.budgetActual })),
    tasks: taskRows.map(task => ({ title: task.title, status: task.status, escalation: task.escalationState, dueDate: task.dueDate })),
    risks: riskRows.map(risk => ({ title: risk.title, probability: risk.probability, impact: risk.impact, mitigation: risk.mitigation })),
    plans: planRows.map(plan => ({ title: plan.title, status: plan.status, diagnostic: plan.diagnostic })),
  };
  return { context, sources };
}

export async function saveAssistantInteraction(workspace: Workspace, question: string, answer: string, sources: unknown[], confidence: "low" | "medium" | "high" | "insufficient") {
  const db = await getDb();
  if (!db) return;
  await db.insert(assistantInteractions).values({ organizationId: workspace.organizationId, userId: workspace.userId, question, answer, sources, confidence });
  await writeAudit({ organizationId: workspace.organizationId, actorUserId: workspace.userId, action: "assistant.answered", entityType: "assistantInteraction", sensitivity: "general", metadata: { sourceCount: sources.length, confidence } });
}
