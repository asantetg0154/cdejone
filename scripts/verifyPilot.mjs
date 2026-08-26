import { getDb } from "../server/db.ts";
import { users } from "../drizzle/schema.ts";
import {
  ensureWorkspace,
  getAnalytics,
  getDashboard,
  getDataHub,
  getPlanning,
  getReports,
  getWorkflow,
  groundedContext,
} from "../server/cdejData.ts";

const db = await getDb();
if (!db) throw new Error("La base de données n’est pas disponible.");
const [user] = await db.select().from(users).limit(1);
if (!user) throw new Error("Aucun utilisateur applicatif n’est disponible.");
const workspace = await ensureWorkspace(user);

const [dashboard, hub, planning, analytics, workflow, reports, context] = await Promise.all([
  getDashboard(workspace),
  getDataHub(workspace),
  getPlanning(workspace),
  getAnalytics(workspace),
  getWorkflow(workspace),
  getReports(workspace),
  groundedContext(workspace),
]);

const summary = {
  dashboardMetrics: Object.keys(dashboard.metrics).length,
  hubActivities: hub.activities?.length ?? 0,
  planningScenarios: planning.scenarios.length,
  analyticsCards: analytics.cards.length,
  workflowTasks: workflow.tasks.length,
  reports: reports.length,
  authorizedSources: context.sources.length,
};

console.log(JSON.stringify(summary));
if (Object.values(summary).some(value => value === 0)) {
  throw new Error("Le jeu pilote ne fournit pas toutes les données nécessaires aux parcours authentifiés.");
}
