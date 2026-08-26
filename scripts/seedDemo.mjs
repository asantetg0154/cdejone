import { getDb } from "../server/db.ts";
import { users } from "../drizzle/schema.ts";
import { ensureWorkspace, seedDemo } from "../server/cdejData.ts";

const db = await getDb();
if (!db) throw new Error("La base de données n’est pas disponible.");

const [user] = await db.select().from(users).limit(1);
if (!user) throw new Error("Aucun utilisateur applicatif n’est disponible pour initialiser le pilote.");

const workspace = await ensureWorkspace(user);
const result = await seedDemo(workspace);
console.log(JSON.stringify({ organizationId: workspace.organizationId, result }));
