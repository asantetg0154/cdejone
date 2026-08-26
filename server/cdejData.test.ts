import { describe, expect, it } from "vitest";
import { assertTenantScope, authorizedSensitivities, buildDiagnostic, enforceGroundedAnswer, guessEntity, mappingForHeaders, type Workspace } from "./cdejData";

const coordinatorWorkspace: Workspace = {
  organizationId: 1,
  organizationName: "CDEJ de test",
  roleCode: "coordinateur",
  userId: 10,
};

describe("garde-fous CDEJ ONE", () => {
  it("limite les données visibles à un coordinateur", () => {
    const visible = authorizedSensitivities(coordinatorWorkspace);
    expect(visible).toContain("general");
    expect(visible).toContain("enfant");
    expect(visible).not.toContain("social");
    expect(visible).not.toContain("sante");
  });

  it("refuse explicitement tout objet issu d’une autre organisation", () => {
    expect(() => assertTenantScope(coordinatorWorkspace, { organizationId: 2 })).toThrow("Accès inter-organisation refusé");
    expect(() => assertTenantScope(coordinatorWorkspace, { organizationId: 1 })).not.toThrow();
  });

  it("propose un mapping de participant à partir d’en-têtes français", () => {
    const mapping = mappingForHeaders(["Référence", "Nom complet", "Année de naissance", "Responsable"]);
    expect(mapping.referenceCode).toBe("Référence");
    expect(mapping.displayName).toBe("Nom complet");
    expect(mapping.birthYear).toBe("Année de naissance");
    expect(guessEntity(mapping)).toBe("participant");
  });

  it("formule un diagnostic prudent lorsque des anomalies de données subsistent", () => {
    const diagnostic = buildDiagnostic({
      objectiveRows: [{ title: "Objectif de test", status: "active" }],
      activityRows: [{ title: "Activité finalisée", status: "completed" }, { title: "Activité en retard", status: "delayed" }],
      validResults: [{ level: "result", value: "52" }],
      qualityIssues: [{ id: 1 }],
    });
    expect(diagnostic).toContain("1 activité(s) finalisée(s)");
    expect(diagnostic).toContain("1 activité(s) en retard");
    expect(diagnostic).toContain("anomalies de données");
  });

  it("ajoute systématiquement la base examinée et la validation humaine à une réponse IA", () => {
    const answer = enforceGroundedAnswer("La participation doit être examinée.", [{ type: "résultat validé", label: "Participation FY27", id: 4 }]);
    expect(answer).toContain("Base examinée");
    expect(answer).toContain("Participation FY27");
    expect(answer).toContain("Limites et validation humaine");
  });
});
