import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { confirmImport, decide, setTaskStatus, type Workspace, updateReportContent } from "./cdejData";

const workspace: Workspace = {
  organizationId: 1,
  organizationName: "Organisation de test",
  roleCode: "coordinateur",
  userId: 5,
};

function crossTenantDb(entity: Record<string, unknown>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [entity],
        }),
      }),
    }),
    update: vi.fn(),
    insert: vi.fn(),
  };
}

describe("fonctions métier protégées par organisation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloque la mise à jour d’une tâche issue d’une autre organisation", async () => {
    vi.mocked(getDb).mockResolvedValue(crossTenantDb({ id: 19, organizationId: 2, status: "open" }) as never);
    await expect(setTaskStatus(workspace, 19, "completed")).rejects.toThrow("Accès inter-organisation refusé");
  });

  it("bloque la validation d’une décision issue d’une autre organisation", async () => {
    vi.mocked(getDb).mockResolvedValue(crossTenantDb({ id: 23, organizationId: 2, decisionState: "pending" }) as never);
    await expect(decide(workspace, 23, "accepted", "Test de refus inter-organisation.")).rejects.toThrow("Accès inter-organisation refusé");
  });

  it("bloque l’édition d’un brouillon issu d’une autre organisation", async () => {
    vi.mocked(getDb).mockResolvedValue(crossTenantDb({ id: 29, organizationId: 2, status: "draft" }) as never);
    await expect(updateReportContent(workspace, 29, "Contenu non autorisé")).rejects.toThrow("Accès inter-organisation refusé");
  });

  it("bloque la confirmation d’un import issu d’une autre organisation", async () => {
    vi.mocked(getDb).mockResolvedValue(crossTenantDb({ id: 31, organizationId: 2, proposedMapping: {}, previewRows: [] }) as never);
    await expect(confirmImport(workspace, 31)).rejects.toThrow("Accès inter-organisation refusé");
  });
});
