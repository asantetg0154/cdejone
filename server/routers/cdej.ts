import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import {
  confirmImport,
  decide,
  enforceGroundedAnswer,
  ensureWorkspace,
  generateVerifiedReport,
  getAnalytics,
  getDashboard,
  getDataHub,
  getPlanning,
  getReports,
  getWorkflow,
  groundedContext,
  hasPermission,
  saveAssistantInteraction,
  seedDemo,
  setTaskStatus,
  updateReportContent,
  updateScenario,
  uploadAndPrepareImport,
  type Workspace,
} from "../cdejData";
import { protectedProcedure, router } from "../_core/trpc";

async function workspaceFor(user: NonNullable<Parameters<typeof ensureWorkspace>[0]>) {
  return ensureWorkspace(user);
}

async function requirePermission(workspace: Workspace, permission: string) {
  if (!(await hasPermission(workspace, permission))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Vous n’êtes pas autorisé à effectuer cette action dans cette organisation." });
  }
}

const sensitivity = z.enum(["general", "enfant", "social", "sante", "finance"]);

export const cdejRouter = router({
  workspace: protectedProcedure.query(async ({ ctx }) => workspaceFor(ctx.user)),
  bootstrapDemo: protectedProcedure.mutation(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "data.write");
    return seedDemo(workspace);
  }),
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "dashboard.read");
    return getDashboard(workspace);
  }),
  dataHub: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "data.read");
    return getDataHub(workspace);
  }),
  analytics: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "dashboard.read");
    return getAnalytics(workspace);
  }),
  planning: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "planning.read");
    return getPlanning(workspace);
  }),
  workflow: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "workflow.read");
    return getWorkflow(workspace);
  }),
  reports: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "report.read");
    return getReports(workspace);
  }),
  prepareImport: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1).max(320),
      mimeType: z.string().min(1).max(160),
      contentBase64: z.string().min(1),
      category: z.enum(["plan", "report", "evaluation", "budget", "register", "other"]),
      sensitivity,
      periodId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceFor(ctx.user);
      await requirePermission(workspace, "document.import");
      return uploadAndPrepareImport(workspace, input);
    }),
  confirmImport: protectedProcedure.input(z.object({ importId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "document.validate");
    return confirmImport(workspace, input.importId);
  }),
  setTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.number().int().positive(), status: z.enum(["open", "in_progress", "blocked", "completed", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceFor(ctx.user);
      await requirePermission(workspace, "workflow.write");
      return setTaskStatus(workspace, input.taskId, input.status);
    }),
  decide: protectedProcedure
    .input(z.object({ decisionId: z.number().int().positive(), state: z.enum(["accepted", "modified", "rejected"]), note: z.string().min(3).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceFor(ctx.user);
      await requirePermission(workspace, "decision.approve");
      return decide(workspace, input.decisionId, input.state, input.note);
    }),
  updateReport: protectedProcedure
    .input(z.object({ reportId: z.number().int().positive(), content: z.string().min(1).max(30000) }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceFor(ctx.user);
      await requirePermission(workspace, "report.write");
      return updateReportContent(workspace, input.reportId, input.content);
    }),
  generateReport: protectedProcedure
    .input(z.object({ type: z.enum(["monthly", "annual", "meeting"]) }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceFor(ctx.user);
      await requirePermission(workspace, "report.write");
      return generateVerifiedReport(workspace, input.type);
    }),
  updateScenario: protectedProcedure
    .input(z.object({
      scenarioId: z.number().int().positive(),
      summary: z.string().min(8).max(3000),
      budgetAssumption: z.string().max(50).optional(),
      activityCount: z.number().int().min(0).max(999),
      expectedReach: z.number().int().min(0).max(100000).optional(),
      assumptions: z.array(z.string().min(2).max(500)).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceFor(ctx.user);
      await requirePermission(workspace, "planning.write");
      return updateScenario(workspace, input.scenarioId, input);
    }),
  ask: protectedProcedure.input(z.object({ question: z.string().min(3).max(1200) })).mutation(async ({ ctx, input }) => {
    const workspace = await workspaceFor(ctx.user);
    await requirePermission(workspace, "assistant.ask");
    const { context, sources } = await groundedContext(workspace);
    if (!sources.length) {
      const answer = "Données insuffisantes pour répondre avec fiabilité. Importez ou validez d’abord des données et documents autorisés dans cet espace CDEJ.";
      await saveAssistantInteraction(workspace, input.question, answer, [], "insufficient");
      return { answer, sources: [], confidence: "insufficient" as const };
    }
    const systemPrompt = `Tu es Ask CDEJ, un assistant institutionnel prudent. Réponds exclusivement en français à partir du CONTEXTE AUTORISÉ ci-dessous. N’invente aucun chiffre, aucun fait, aucune règle et aucune source. Ne prends jamais de décision finale : formule des options et indique qu’une validation humaine est requise. Si le contexte ne suffit pas, écris exactement : « Données insuffisantes pour conclure avec fiabilité. » puis explique quelles données manquent. Cite les éléments utilisés sous une courte rubrique « Base examinée ».\n\nCONTEXTE AUTORISÉ :\n${JSON.stringify(context)}`;
    let answer = "Données insuffisantes pour conclure avec fiabilité.";
    let confidence: "low" | "medium" | "high" | "insufficient" = "low";
    try {
      const response = await invokeLLM({
        model: "gpt-5-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: input.question }],
        maxTokens: 900,
      });
      const modelContent = response.choices[0]?.message?.content;
      answer = typeof modelContent === "string" ? modelContent.trim() || answer : answer;
      confidence = sources.length >= 4 ? "medium" : "low";
    } catch {
      answer = `Je ne peux pas générer une analyse complète pour le moment. Voici les éléments autorisés disponibles : ${sources.slice(0, 5).map(source => source.label).join(" ; ")}. Une validation humaine reste requise.`;
    }
    answer = enforceGroundedAnswer(answer, sources.slice(0, 12));
    await saveAssistantInteraction(workspace, input.question, answer, sources.slice(0, 12), confidence);
    return { answer, sources: sources.slice(0, 12), confidence };
  }),
});
