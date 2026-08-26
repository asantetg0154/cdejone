import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Severity = "urgent" | "important" | "information";

const sectionTitle: Record<string, { title: string; description: string }> = {
  "/": { title: "Tableau de bord", description: "Une lecture concise de la situation, des priorités et des limites de données." },
  "/tableau-de-bord": { title: "Tableau de bord", description: "Une lecture concise de la situation, des priorités et des limites de données." },
  "/hub": { title: "CDEJ Data Hub", description: "Données interconnectées, filtrées par organisation, rôle et sensibilité." },
  "/importer": { title: "Importer et contrôler", description: "Prévisualiser, mapper, détecter les anomalies puis valider avant exploitation." },
  "/planification": { title: "Préparer FY", description: "Transformer l’historique validé en diagnostic, scénarios et propositions à revoir." },
  "/analyses": { title: "Analyses", description: "Distinguer réalisation, participation, résultats et impact — sans surinterpréter les données." },
  "/workflows": { title: "Workflows et validations", description: "Suivre les responsabilités, échéances, états d’escalade et décisions humaines." },
  "/documents": { title: "Rapports et réunions", description: "Brouillons éditables fondés sur les données disponibles et validées." },
  "/ask-cdej": { title: "Ask CDEJ", description: "Un assistant qui répond depuis les données autorisées, avec prudence et traçabilité." },
};

function formatNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("fr-TG", { maximumFractionDigits: 1 }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-TG", { day: "2-digit", month: "short", year: "numeric" });
}

function severityStyle(level: Severity) {
  if (level === "urgent") return "border-rose-200 bg-rose-50 text-rose-800";
  if (level === "important") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function severityLabel(level: Severity) {
  return level === "urgent" ? "Urgent" : level === "important" ? "Important" : "Information";
}

function EmptyWorkspace({ onSeed, pending }: { onSeed: () => void; pending: boolean }) {
  return (
    <Card className="border-dashed border-slate-300 bg-white shadow-none">
      <CardContent className="flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Database className="size-5" /></div>
          <h2 className="text-lg font-semibold text-slate-900">Votre espace est prêt pour les premières données</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Importez un document réel ou chargez un jeu de démonstration clairement fictif afin d’explorer les tableaux de bord, le planning FY et les workflows. Les données de démonstration ne doivent pas être utilisées comme données opérationnelles.</p>
        </div>
        <Button onClick={onSeed} disabled={pending} className="shrink-0 bg-teal-700 hover:bg-teal-800">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
          Charger la démonstration fictive
        </Button>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, hint, tone = "slate", icon: Icon }: { label: string; value: string | number; hint: string; tone?: "teal" | "amber" | "rose" | "slate"; icon: typeof Database }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p></div>
          <div className={cn("flex size-10 items-center justify-center rounded-xl", tones[tone])}><Icon className="size-5" /></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{hint}</p>
      </CardContent>
    </Card>
  );
}

function DashboardView() {
  const utils = trpc.useUtils();
  const dashboard = trpc.cdej.dashboard.useQuery();
  const bootstrap = trpc.cdej.bootstrapDemo.useMutation({
    onSuccess: result => { toast.success(result.message); void utils.cdej.dashboard.invalidate(); void utils.cdej.dataHub.invalidate(); },
    onError: error => toast.error(error.message),
  });
  if (dashboard.isLoading) return <LoadingPanel label="Préparation du tableau de bord…" />;
  if (dashboard.error) return <ErrorPanel message={dashboard.error.message} />;
  const data = dashboard.data;
  if (!data || data.metrics.participants === 0 && data.metrics.activities.planned === 0) return <EmptyWorkspace onSeed={() => bootstrap.mutate()} pending={bootstrap.isPending} />;
  const attention = data.attention;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Participants" value={formatNumber(data.metrics.participants)} hint="Dossiers visibles selon vos droits." tone="teal" icon={UsersRound} />
        <MetricCard label="Exécution" value={`${data.metrics.executionRate} %`} hint={`${data.metrics.activities.completed} activité(s) finalisée(s) sur ${data.metrics.activities.planned}.`} tone="slate" icon={ClipboardCheck} />
        <MetricCard label="Qualité des données" value={`${data.metrics.dataQuality} %`} hint="Score indicatif déduit des anomalies ouvertes." tone={data.metrics.dataQuality < 75 ? "amber" : "teal"} icon={ShieldCheck} />
        <MetricCard label="Travail à échéance" value={formatNumber(data.metrics.overdueWork)} hint={`${data.metrics.openRisks} risque(s) ouvert(s) et ${data.metrics.pendingDecisions} décision(s) en attente.`} tone={data.metrics.overdueWork ? "rose" : "teal"} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 border-b border-slate-100 pb-5">
            <div><CardTitle className="text-lg">Ce qui nécessite votre attention</CardTitle><CardDescription className="mt-1">Seuls les signaux nécessitant un examen ou une décision sont présentés.</CardDescription></div>
            <Badge variant="outline" className="border-slate-200 text-slate-600">{attention.length} signal(aux)</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {attention.length ? attention.map((item, index) => (
              <div key={item.id} className={cn("flex gap-4 px-6 py-5", index < attention.length - 1 && "border-b border-slate-100")}>
                <div className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", item.level === "urgent" ? "bg-rose-500" : item.level === "important" ? "bg-amber-500" : "bg-emerald-500")} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{item.title}</p><Badge variant="outline" className={cn("text-[10px]", severityStyle(item.level))}>{severityLabel(item.level)}</Badge></div><p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p></div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-slate-400" />
              </div>
            )) : <div className="p-8 text-sm text-slate-500">Aucun signal prioritaire n’est disponible dans les données actuelles.</div>}
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-900 text-white shadow-sm">
          <CardHeader><div className="flex items-center gap-2 text-teal-200"><Sparkles className="size-4" /><span className="text-xs font-medium uppercase tracking-[0.12em]">Lecture guidée</span></div><CardTitle className="mt-2 text-xl text-white">État du CDEJ</CardTitle></CardHeader>
          <CardContent className="space-y-5"><div><div className="flex justify-between text-sm text-slate-300"><span>Progression des résultats</span><span>{data.metrics.resultProgress} %</span></div><Progress value={data.metrics.resultProgress} className="mt-2 h-2 bg-slate-700" /></div><Separator className="bg-slate-700" /><p className="text-sm leading-6 text-slate-300">{data.limitation}</p><div className="rounded-lg border border-teal-400/20 bg-teal-400/10 p-3 text-xs leading-5 text-teal-100">Les propositions et alertes sont des aides au travail. Les validations importantes restent humaines et journalisées.</div></CardContent>
        </Card>
      </div>
    </div>
  );
}

function DataHubView() {
  const hub = trpc.cdej.dataHub.useQuery();
  if (hub.isLoading) return <LoadingPanel label="Chargement du CDEJ Data Hub…" />;
  if (hub.error || !hub.data) return <ErrorPanel message={hub.error?.message ?? "Données indisponibles."} />;
  const data = hub.data;
  const groups = [
    ["Participants", data.participants.length, "Dossiers visibles et pseudonymisables selon le niveau de sensibilité."],
    ["Activités", data.activities.length, "Réalisation, participation et ressources liées."],
    ["Objectifs", data.objectives.length, "Chaîne objectif → activité → résultat."],
    ["Documents", data.documents.length, "Sources conservées avec statut et provenance."],
  ];
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{groups.map(([name, count, detail]) => <MetricCard key={String(name)} label={String(name)} value={Number(count)} hint={String(detail)} tone="slate" icon={Database} />)}</div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-lg">Périodes et objectifs</CardTitle><CardDescription>Référentiel disponible dans votre organisation.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex flex-wrap gap-2">{data.periods.length ? data.periods.map(period => <Badge key={period.id} variant="outline" className="border-teal-200 bg-teal-50 px-3 py-1 text-teal-800">{period.code} · {period.status}</Badge>) : <p className="text-sm text-slate-500">Aucune période structurée.</p>}</div><Table><TableHeader><TableRow><TableHead>Objectif</TableHead><TableHead>État</TableHead><TableHead>Réel / cible</TableHead></TableRow></TableHeader><TableBody>{data.objectives.length ? data.objectives.map(objective => <TableRow key={objective.id}><TableCell className="max-w-[250px] font-medium text-slate-800">{objective.title}</TableCell><TableCell><StatusBadge value={objective.status} /></TableCell><TableCell>{formatNumber(objective.actualValue)} / {formatNumber(objective.targetValue)}</TableCell></TableRow>) : <EmptyRow span={3} label="Aucun objectif disponible." />}</TableBody></Table></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-lg">Documents contrôlés</CardTitle><CardDescription>Seuls les documents autorisés pour votre rôle sont affichés.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>État</TableHead><TableHead>Type</TableHead></TableRow></TableHeader><TableBody>{data.documents.length ? data.documents.map(document => <TableRow key={document.id}><TableCell><div className="font-medium text-slate-800">{document.originalName}</div><div className="mt-0.5 text-xs text-slate-500">Reçu le {formatDate(document.createdAt)}</div></TableCell><TableCell><StatusBadge value={document.status} /></TableCell><TableCell className="capitalize">{document.category}</TableCell></TableRow>) : <EmptyRow span={3} label="Aucun document visible. Importez un fichier pour commencer." />}</TableBody></Table></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-lg">Activités récentes</CardTitle><CardDescription>La participation est distincte de l’exécution et des résultats.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Activité</TableHead><TableHead>Responsable</TableHead><TableHead>Participation</TableHead><TableHead>État</TableHead></TableRow></TableHeader><TableBody>{data.activities.length ? data.activities.map(activity => <TableRow key={activity.id}><TableCell className="font-medium text-slate-800">{activity.title}</TableCell><TableCell>{activity.ownerName ?? "—"}</TableCell><TableCell>{formatNumber(activity.actualParticipants)} / {formatNumber(activity.expectedParticipants)}</TableCell><TableCell><StatusBadge value={activity.status} /></TableCell></TableRow>) : <EmptyRow span={4} label="Aucune activité disponible." />}</TableBody></Table></CardContent></Card>
  </div>;
}

function ImportView() {
  const utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<"plan" | "report" | "evaluation" | "budget" | "register" | "other">("report");
  const [sensitivity, setSensitivity] = useState<"general" | "enfant" | "social" | "sante" | "finance">("general");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof trpc.cdej.prepareImport.useMutation>>["data"] | null>(null);
  const prepare = trpc.cdej.prepareImport.useMutation({ onSuccess: data => { setPreview(data); toast.success("Prévisualisation préparée. Vérifiez le mapping avant validation."); }, onError: error => toast.error(error.message) });
  const confirm = trpc.cdej.confirmImport.useMutation({ onSuccess: data => { toast.success(`${data.importedRows} ligne(s) intégrée(s) après validation.`); setPreview(null); setFile(null); void utils.cdej.dataHub.invalidate(); void utils.cdej.dashboard.invalidate(); }, onError: error => toast.error(error.message) });
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    if (!file) return toast.error("Sélectionnez un fichier avant de préparer l’import.");
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
      prepare.mutate({ fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: base64, category, sensitivity });
    };
    reader.readAsDataURL(file);
  };
  return <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <Card className="border-slate-200"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><UploadCloud className="size-5" /></div><CardTitle className="mt-3 text-lg">Déposer un document</CardTitle><CardDescription>Formats acceptés : Excel, CSV, Word ou PDF. Le fichier reste privé à votre organisation et conserve sa provenance.</CardDescription></CardHeader><CardContent className="space-y-5"><button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center transition-colors hover:border-teal-500 hover:bg-teal-50/40"><UploadCloud className="mb-3 size-7 text-slate-400" /><span className="text-sm font-medium text-slate-700">{file ? file.name : "Choisir un fichier"}</span><span className="mt-1 text-xs text-slate-500">Prévisualisation sécurisée limitée à 7 Mo</span></button><Input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls,.csv,.doc,.docx,.pdf" onChange={event => setFile(event.target.files?.[0] ?? null)} />
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Catégorie</Label><Select value={category} onValueChange={value => setCategory(value as typeof category)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="plan">Plan</SelectItem><SelectItem value="report">Rapport</SelectItem><SelectItem value="evaluation">Évaluation</SelectItem><SelectItem value="budget">Budget</SelectItem><SelectItem value="register">Registre</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Niveau de sensibilité</Label><Select value={sensitivity} onValueChange={value => setSensitivity(value as typeof sensitivity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">Général</SelectItem><SelectItem value="enfant">Enfant</SelectItem><SelectItem value="social">Social</SelectItem><SelectItem value="sante">Santé</SelectItem><SelectItem value="finance">Finance</SelectItem></SelectContent></Select></div></div><Button className="w-full bg-teal-700 hover:bg-teal-800" onClick={submit} disabled={!file || prepare.isPending}>{prepare.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileCheck2 className="mr-2 size-4" />}Préparer l’import</Button></CardContent></Card>
      <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Règles de contrôle</CardTitle><CardDescription>Le système assiste la préparation ; l’intégration est validée par une personne autorisée.</CardDescription></CardHeader><CardContent className="space-y-4">{[["1", "Classifier", "Conserver le fichier, le type, le niveau de sensibilité et la date de réception."],["2", "Proposer", "Identifier les colonnes disponibles et suggérer un mapping vers le hub de données."],["3", "Signaler", "Détecter les champs manquants, doublons potentiels et limites de structure."],["4", "Valider", "N’intégrer les données exploitables qu’après revue explicite et auditée."]].map(([number, title, text]) => <div key={number} className="flex gap-3"><div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{number}</div><div><p className="text-sm font-medium text-slate-800">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p></div></div>)}</CardContent></Card>
    </div>
    {preview && <Card className="border-teal-200 shadow-sm"><CardHeader className="border-b border-teal-100 bg-teal-50/50"><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="text-lg text-teal-950">Prévisualisation et mapping proposés</CardTitle><CardDescription className="mt-1 text-teal-800">Type détecté : <strong>{preview.entityType}</strong> · {preview.previewRows.length} ligne(s) visibles · provenance conservée.</CardDescription></div><Badge className="bg-teal-700">En attente de validation</Badge></div></CardHeader><CardContent className="space-y-6 p-6"><div className="grid gap-4 md:grid-cols-3"><MetricCard label="Anomalies" value={preview.anomalies.length} hint="À examiner avant intégration." tone={preview.anomalies.length ? "amber" : "teal"} icon={AlertTriangle}/><MetricCard label="Doublons potentiels" value={preview.duplicateCount} hint="Comparaison effectuée dans la prévisualisation." tone={preview.duplicateCount ? "amber" : "slate"} icon={Database}/><MetricCard label="Provenance" value="Conservée" hint="Fichier, date, mapping et validation sont journalisés." tone="teal" icon={ShieldCheck}/></div><div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]"><div><p className="mb-3 text-sm font-semibold text-slate-800">Correspondances proposées</p><div className="space-y-2">{Object.entries(preview.mapping).filter(([, source]) => source).map(([target, source]) => <div key={target} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span className="font-medium text-slate-700">{target}</span><span className="text-slate-500">← {source}</span></div>)}{!Object.values(preview.mapping).some(Boolean) && <p className="text-sm text-slate-500">Aucun mapping tabulaire automatique n’a été détecté. Le document peut être examiné manuellement.</p>}</div></div><div><p className="mb-3 text-sm font-semibold text-slate-800">Lignes prévisualisées</p><div className="overflow-x-auto rounded-lg border border-slate-200"><Table><TableHeader><TableRow>{Object.keys(preview.previewRows[0] ?? {}).slice(0, 6).map(key => <TableHead key={key}>{key}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.previewRows.slice(0, 5).map((row, index) => <TableRow key={index}>{Object.keys(preview.previewRows[0] ?? {}).slice(0, 6).map(key => <TableCell key={key} className="max-w-44 truncate">{String(row[key] ?? "")}</TableCell>)}</TableRow>)}</TableBody></Table></div></div></div>{preview.anomalies.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Points à vérifier</p><ul className="mt-2 space-y-1 text-sm leading-6 text-amber-800">{preview.anomalies.map((anomaly, index) => <li key={index}>• {anomaly.description}</li>)}</ul></div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Aucune anomalie structurelle n’a été détectée dans la prévisualisation. La validation humaine reste obligatoire.</div>}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="max-w-2xl text-xs leading-5 text-slate-500">La confirmation marque le document comme validé et intègre uniquement les lignes compatibles avec le mapping proposé. Les informations sensibles restent filtrées par rôle.</p><Button onClick={() => confirm.mutate({ importId: preview.importId })} disabled={confirm.isPending} className="bg-teal-700 hover:bg-teal-800">{confirm.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Valider et intégrer</Button></div></CardContent></Card>}
  </div>;
}

function PlanningView() {
  const plan = trpc.cdej.planning.useQuery();
  if (plan.isLoading) return <LoadingPanel label="Préparation du diagnostic FY…" />;
  if (plan.error || !plan.data) return <ErrorPanel message={plan.error?.message ?? "Planification indisponible."} />;
  const data = plan.data;
  const scenarioLabels = { conservative: "Conservateur", balanced: "Équilibré", ambitious: "Ambitieux" };
  const utils = trpc.useUtils();
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [budgetDraft, setBudgetDraft] = useState("");
  const [activityCountDraft, setActivityCountDraft] = useState("");
  const [reachDraft, setReachDraft] = useState("");
  const [assumptionDraft, setAssumptionDraft] = useState("");
  const updateScenario = trpc.cdej.updateScenario.useMutation({ onSuccess: () => { toast.success("Scénario mis à jour et journalisé pour revue humaine."); void utils.cdej.planning.invalidate(); }, onError: error => toast.error(error.message) });
  const activeScenario = data.scenarios.find(item => item.id === selectedScenarioId) ?? data.scenarios[0];
  const chooseScenario = (id: number) => {
    const next = data.scenarios.find(item => item.id === id);
    if (!next) return;
    setSelectedScenarioId(id);
    setSummaryDraft(next.summary);
    setBudgetDraft(String(next.budgetAssumption ?? ""));
    setActivityCountDraft(String(next.activityCount));
    setReachDraft(String(next.expectedReach ?? ""));
    setAssumptionDraft(Array.isArray(next.assumptions) ? next.assumptions.join("\n") : "");
  };
  if (activeScenario) {
    return <div className="space-y-6"><Card className="overflow-hidden border-slate-200"><CardHeader className="border-b border-slate-100 bg-[linear-gradient(110deg,#f0fdfa_0%,#ffffff_55%,#f8fafc_100%)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-teal-700"><Sparkles className="size-4" /> Planification assistée</div><CardTitle className="text-xl">{data.targetPeriod ? `Préparer ${data.targetPeriod.code}` : "Initialiser la planification"}</CardTitle><CardDescription className="mt-2 max-w-3xl leading-6">{data.diagnostic}</CardDescription></div><Badge variant="outline" className="border-teal-200 bg-white text-teal-800">Validation humaine requise</Badge></div></CardHeader><CardContent className="grid gap-5 p-6 md:grid-cols-3"><PlanningPoint label="Objectifs à suivre" value={data.objectives.length} detail="Associés à des responsables, résultats et indicateurs." icon={ClipboardCheck}/><PlanningPoint label="Activités disponibles" value={data.activities.length} detail="L’historique éclaire les hypothèses sans les imposer." icon={BarChart3}/><PlanningPoint label="Scénarios" value={data.scenarios.length} detail="Chaque option peut être modifiée et revue." icon={ShieldCheck}/></CardContent></Card><div className="grid gap-5 xl:grid-cols-3">{data.scenarios.map(scenario => <Card key={scenario.id} className={cn("cursor-pointer border-slate-200 shadow-sm transition-colors", activeScenario.id === scenario.id ? "border-teal-300 ring-1 ring-teal-100" : "hover:border-slate-300")} onClick={() => chooseScenario(scenario.id)}><CardHeader><Badge variant="outline" className={scenario.name === "balanced" ? "w-fit border-teal-200 bg-teal-50 text-teal-800" : "w-fit border-slate-200 text-slate-600"}>{scenarioLabels[scenario.name]}</Badge><CardTitle className="mt-3 text-lg">{formatNumber(scenario.expectedReach)} personnes visées</CardTitle><CardDescription>{scenario.summary}</CardDescription></CardHeader><CardContent><p className="text-sm text-slate-600">{formatNumber(scenario.budgetAssumption)} FCFA · {scenario.activityCount} activité(s)</p></CardContent></Card>)}</div><Card className="border-teal-200"><CardHeader><CardTitle className="text-lg">Ajuster le scénario sélectionné</CardTitle><CardDescription>Les modifications sont tracées. Elles ne déclenchent aucune approbation automatique.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Scénario</Label><Select value={String(activeScenario.id)} onValueChange={value => chooseScenario(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.scenarios.map(scenario => <SelectItem key={scenario.id} value={String(scenario.id)}>{scenarioLabels[scenario.name]}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Hypothèse budgétaire (FCFA)</Label><Input value={budgetDraft || String(activeScenario.budgetAssumption ?? "")} onChange={event => setBudgetDraft(event.target.value)} inputMode="numeric" /></div><div className="space-y-2"><Label>Nombre d’activités</Label><Input value={activityCountDraft || String(activeScenario.activityCount)} onChange={event => setActivityCountDraft(event.target.value)} inputMode="numeric" /></div><div className="space-y-2"><Label>Portée attendue</Label><Input value={reachDraft || String(activeScenario.expectedReach ?? "")} onChange={event => setReachDraft(event.target.value)} inputMode="numeric" /></div><div className="space-y-2 md:col-span-2"><Label>Synthèse</Label><Textarea value={summaryDraft || activeScenario.summary} onChange={event => setSummaryDraft(event.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label>Hypothèses (une par ligne)</Label><Textarea value={assumptionDraft || (Array.isArray(activeScenario.assumptions) ? activeScenario.assumptions.join("\n") : "")} onChange={event => setAssumptionDraft(event.target.value)} /></div></div><div className="mt-4 flex justify-end"><Button onClick={() => updateScenario.mutate({ scenarioId: activeScenario.id, summary: summaryDraft || activeScenario.summary, budgetAssumption: budgetDraft || String(activeScenario.budgetAssumption ?? ""), activityCount: Number(activityCountDraft || activeScenario.activityCount), expectedReach: Number(reachDraft || activeScenario.expectedReach || 0), assumptions: (assumptionDraft || (Array.isArray(activeScenario.assumptions) ? activeScenario.assumptions.join("\n") : "")).split("\n").map(item => item.trim()).filter(Boolean) })} disabled={updateScenario.isPending} className="bg-teal-700 hover:bg-teal-800">{updateScenario.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Enregistrer pour revue</Button></div></CardContent></Card><Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Objectifs et activités proposés</CardTitle><CardDescription>Les données visibles sont structurées pour alimenter le cycle objectif → activité → résultat → impact.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Élément</TableHead><TableHead>Responsable</TableHead><TableHead>État</TableHead><TableHead>Valeur / budget</TableHead></TableRow></TableHeader><TableBody>{[...data.objectives.map(item => ({ id: `o-${item.id}`, title: item.title, owner: item.ownerName, state: item.status, display: `${formatNumber(item.actualValue)} / ${formatNumber(item.targetValue)}` })), ...data.activities.map(item => ({ id: `a-${item.id}`, title: item.title, owner: item.ownerName, state: item.status, display: `${formatNumber(item.budgetPlanned)} FCFA` }))].slice(0, 8).map(item => <TableRow key={item.id}><TableCell className="font-medium text-slate-800">{item.title}</TableCell><TableCell>{item.owner ?? "À attribuer"}</TableCell><TableCell><StatusBadge value={item.state} /></TableCell><TableCell>{item.display}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Card className="border-amber-200 bg-amber-50"><CardContent className="space-y-2 p-5">{data.limitations.map((item, index) => <div key={index} className="flex gap-3 text-sm leading-6 text-amber-950"><AlertTriangle className="mt-1 size-4 shrink-0" />{item}</div>)}</CardContent></Card></div>;
  }
  return <div className="space-y-6"><Card className="overflow-hidden border-slate-200"><CardHeader className="border-b border-slate-100 bg-[linear-gradient(110deg,#f0fdfa_0%,#ffffff_55%,#f8fafc_100%)]"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-teal-700"><Sparkles className="size-4" /> Planification assistée</div><CardTitle className="text-xl">{data.targetPeriod ? `Préparer ${data.targetPeriod.code}` : "Initialiser la planification"}</CardTitle><CardDescription className="mt-2 max-w-3xl leading-6">{data.diagnostic}</CardDescription></div><Badge variant="outline" className="border-teal-200 bg-white text-teal-800">{data.plan.status === "review" ? "À revoir" : "Brouillon"}</Badge></div></CardHeader><CardContent className="grid gap-5 p-6 md:grid-cols-3"><PlanningPoint label="Objectifs disponibles" value={data.objectives.length} detail="Propositions à associer à des résultats et indicateurs." icon={ClipboardCheck}/><PlanningPoint label="Activités historiques" value={data.activities.length} detail="Base pour identifier les continuités et écarts." icon={BarChart3}/><PlanningPoint label="Validation requise" value="Oui" detail="Un scénario n’est jamais appliqué automatiquement." icon={ShieldCheck}/></CardContent></Card><div className="grid gap-5 xl:grid-cols-3">{data.scenarios.length ? data.scenarios.map(scenario => <Card key={scenario.id} className={cn("border-slate-200 shadow-sm", scenario.name === "balanced" && "border-teal-300 ring-1 ring-teal-100")}><CardHeader><div className="flex items-center justify-between"><Badge variant="outline" className={scenario.name === "balanced" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}>{scenarioLabels[scenario.name]}</Badge>{scenario.name === "balanced" && <span className="text-xs font-medium text-teal-700">Option recommandée à examiner</span>}</div><CardTitle className="mt-3 text-lg">{formatNumber(scenario.expectedReach)} personnes visées</CardTitle><CardDescription>{scenario.summary}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-[0.1em] text-slate-500">Hypothèse budgétaire</p><p className="mt-1 text-xl font-semibold text-slate-900">{formatNumber(scenario.budgetAssumption)} FCFA</p></div><p className="text-sm text-slate-600">{scenario.activityCount} activité(s) planifiée(s)</p><div className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">{Array.isArray(scenario.assumptions) ? scenario.assumptions.join(" · ") : "Hypothèses à documenter."}</div></CardContent></Card>) : <Card className="xl:col-span-3"><CardContent className="p-7 text-sm text-slate-500">Aucun scénario n’est disponible. Chargez les données de démonstration ou importez des périodes historiques validées.</CardContent></Card>}</div><Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Limites et garde-fous</CardTitle></CardHeader><CardContent className="space-y-2">{data.limitations.map((item, index) => <div key={index} className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{item}</div>)}</CardContent></Card></div>;
}

function AnalyticsView() {
  const analytics = trpc.cdej.analytics.useQuery();
  if (analytics.isLoading) return <LoadingPanel label="Calcul des analyses disponibles…" />;
  if (analytics.error || !analytics.data) return <ErrorPanel message={analytics.error?.message ?? "Analyses indisponibles."} />;
  const labels: Record<string, string> = { delivery: "Réalisation", participation: "Participation", result: "Résultat", impact: "Impact" };
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{analytics.data.cards.map(card => <Card key={card.level} className="border-slate-200"><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{labels[card.level]}</p><div className="mt-3 flex items-end gap-2"><span className="text-3xl font-semibold text-slate-900">{formatNumber(card.value)}</span><span className="pb-1 text-sm text-slate-500">/ cible {formatNumber(card.target)}</span></div><p className="mt-3 text-xs text-slate-500">{card.count} mesure(s) validée(s)</p></CardContent></Card>)}</div><div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><Card><CardHeader><CardTitle className="text-lg">Évolution par période</CardTitle><CardDescription>Moyenne descriptive des mesures validées ; ce n’est pas une prédiction.</CardDescription></CardHeader><CardContent>{analytics.data.timeline.length ? <div className="space-y-4">{analytics.data.timeline.map(point => <div key={point.label}><div className="flex justify-between text-sm text-slate-700"><span>{point.label}</span><span className="font-medium">{formatNumber(point.value)}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-teal-600" style={{ width: `${Math.min(100, point.value)}%` }} /></div></div>)}</div> : <p className="text-sm text-slate-500">Aucune période comparable n’est encore disponible.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Participation par activité</CardTitle><CardDescription>Comparer les présents aux effectifs prévus, sans confondre cela avec un résultat.</CardDescription></CardHeader><CardContent className="space-y-4">{analytics.data.participation.length ? analytics.data.participation.map(item => <div key={item.name} className="rounded-lg border border-slate-100 p-3"><p className="truncate text-sm font-medium text-slate-800">{item.name}</p><div className="mt-2 flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-700" style={{ width: `${Math.min(100, item.planned ? item.actual / item.planned * 100 : 0)}%` }} /></div><span className="text-xs text-slate-500">{item.actual} / {item.planned}</span></div></div>) : <p className="text-sm text-slate-500">Aucune donnée de participation disponible.</p>}</CardContent></Card></div>{analytics.data.limitations.length ? <Card className="border-amber-200 bg-amber-50"><CardContent className="space-y-2 p-5">{analytics.data.limitations.map((limitation, index) => <div key={index} className="flex gap-3 text-sm leading-6 text-amber-950"><AlertTriangle className="mt-1 size-4 shrink-0" />{limitation}</div>)}</CardContent></Card> : <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex gap-3 p-5 text-sm text-emerald-900"><CheckCircle2 className="size-4 shrink-0" />Les analyses affichées reposent sur les données validées actuellement disponibles.</CardContent></Card>}</div>;
}

function WorkflowsView() {
  const utils = trpc.useUtils();
  const workflow = trpc.cdej.workflow.useQuery();
  const setStatus = trpc.cdej.setTaskStatus.useMutation({ onSuccess: () => { toast.success("État de la tâche mis à jour et journalisé."); void utils.cdej.workflow.invalidate(); void utils.cdej.dashboard.invalidate(); }, onError: error => toast.error(error.message) });
  const decide = trpc.cdej.decide.useMutation({ onSuccess: () => { toast.success("Décision humaine enregistrée dans l’audit."); void utils.cdej.workflow.invalidate(); void utils.cdej.dashboard.invalidate(); }, onError: error => toast.error(error.message) });
  if (workflow.isLoading) return <LoadingPanel label="Chargement des workflows…" />;
  if (workflow.error || !workflow.data) return <ErrorPanel message={workflow.error?.message ?? "Workflows indisponibles."} />;
  return <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"><Card><CardHeader><CardTitle className="text-lg">Tâches, responsabilités et escalades</CardTitle><CardDescription>La mise à jour d’état est explicitement attribuée à l’utilisateur connecté.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Tâche</TableHead><TableHead>Responsable</TableHead><TableHead>Échéance</TableHead><TableHead>État</TableHead><TableHead /></TableRow></TableHeader><TableBody>{workflow.data.tasks.length ? workflow.data.tasks.map(task => <TableRow key={task.id}><TableCell><div className="font-medium text-slate-800">{task.title}</div><div className="mt-1 flex gap-1"><Badge variant="outline" className={cn("text-[10px]", task.priority === "urgent" ? severityStyle("urgent") : task.priority === "important" ? severityStyle("important") : severityStyle("information"))}>{severityLabel(task.priority)}</Badge>{task.escalationState !== "none" && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-800">{task.escalationState === "overdue" ? "En retard" : "À surveiller"}</Badge>}</div></TableCell><TableCell>{task.ownerName ?? "—"}</TableCell><TableCell>{formatDate(task.dueDate)}</TableCell><TableCell><StatusBadge value={task.status}/></TableCell><TableCell><Select value={task.status} onValueChange={status => setStatus.mutate({ taskId: task.id, status: status as "open" | "in_progress" | "blocked" | "completed" | "cancelled" })}><SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Ouverte</SelectItem><SelectItem value="in_progress">En cours</SelectItem><SelectItem value="blocked">Bloquée</SelectItem><SelectItem value="completed">Terminée</SelectItem><SelectItem value="cancelled">Annulée</SelectItem></SelectContent></Select></TableCell></TableRow>) : <EmptyRow span={5} label="Aucune tâche n’est disponible." />}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Décisions à valider</CardTitle><CardDescription>Une recommandation n’est pas une décision : l’approbation reste explicite.</CardDescription></CardHeader><CardContent className="space-y-4">{workflow.data.decisions.length ? workflow.data.decisions.map(decision => <div key={decision.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><p className="font-medium leading-5 text-slate-900">{decision.title}</p><Badge variant="outline" className="shrink-0 text-xs">{decision.confidence === "insufficient" ? "Données insuffisantes" : `Confiance ${decision.confidence === "medium" ? "moyenne" : decision.confidence}`}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-600">{decision.recommendation ?? decision.context}</p><p className="mt-3 text-xs leading-5 text-slate-500">{decision.rationale}</p>{decision.decisionState === "pending" ? <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => decide.mutate({ decisionId: decision.id, state: "accepted", note: "Décision acceptée après revue humaine." })} className="bg-teal-700 hover:bg-teal-800">Accepter</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ decisionId: decision.id, state: "modified", note: "Décision modifiée après revue humaine." })}>Modifier</Button><Button size="sm" variant="outline" className="text-rose-700 hover:text-rose-800" onClick={() => decide.mutate({ decisionId: decision.id, state: "rejected", note: "Décision rejetée après revue humaine." })}>Rejeter</Button></div> : <div className="mt-4 rounded-md bg-slate-50 p-2 text-xs text-slate-600">Décision {decision.decisionState} le {formatDate(decision.decidedAt)}. {decision.decisionNote}</div>}</div>) : <p className="text-sm text-slate-500">Aucune décision en attente.</p>}</CardContent></Card></div>;
}

function ReportsView() {
  const utils = trpc.useUtils();
  const reports = trpc.cdej.reports.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const update = trpc.cdej.updateReport.useMutation({ onSuccess: () => { toast.success("Brouillon enregistré pour revue humaine."); void utils.cdej.reports.invalidate(); }, onError: error => toast.error(error.message) });
  const generate = trpc.cdej.generateReport.useMutation({ onSuccess: result => { toast.success("Brouillon généré à partir des sources validées autorisées."); setSelectedId(result.reportId); setContent(result.content); void utils.cdej.reports.invalidate(); }, onError: error => toast.error(error.message) });
  if (reports.isLoading) return <LoadingPanel label="Chargement des brouillons…" />;
  if (reports.error || !reports.data) return <ErrorPanel message={reports.error?.message ?? "Brouillons indisponibles."} />;
  const current = reports.data.find(report => report.id === selectedId) ?? reports.data[0];
  const text = selectedId === current?.id ? content : current?.content ?? "";
  const select = (id: number) => { const report = reports.data?.find(item => item.id === id); setSelectedId(id); setContent(report?.content ?? ""); };
  return <div className="grid gap-6 xl:grid-cols-[0.34fr_0.66fr]"><Card><CardHeader><CardTitle className="text-lg">Brouillons disponibles</CardTitle><CardDescription>Chaque brouillon indique sa base de données et son état de validation.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-lg border border-teal-100 bg-teal-50 p-3"><p className="text-xs font-medium text-teal-950">Créer depuis les données validées</p><div className="mt-2 grid gap-2"><Button size="sm" variant="outline" onClick={() => generate.mutate({ type: "monthly" })} disabled={generate.isPending}>Rapport mensuel</Button><Button size="sm" variant="outline" onClick={() => generate.mutate({ type: "meeting" })} disabled={generate.isPending}>Préparation de réunion</Button><Button size="sm" variant="outline" onClick={() => generate.mutate({ type: "annual" })} disabled={generate.isPending}>Rapport annuel</Button></div></div>{reports.data.length ? reports.data.map(report => <button key={report.id} onClick={() => select(report.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", current?.id === report.id ? "border-teal-300 bg-teal-50" : "border-slate-200 hover:bg-slate-50")}><div className="flex justify-between gap-2"><span className="text-sm font-medium text-slate-800">{report.title}</span><StatusBadge value={report.status} /></div><p className="mt-1 text-xs text-slate-500">{report.type === "meeting" ? "Préparation de réunion" : report.type === "monthly" ? "Rapport mensuel" : "Rapport annuel"}</p></button>) : <p className="text-sm text-slate-500">Aucun brouillon disponible.</p>}</CardContent></Card><Card><CardHeader className="border-b border-slate-100"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg">{current?.title ?? "Sélectionner un brouillon"}</CardTitle><CardDescription className="mt-1">Texte modifiable. Toute modification est placée en revue avant validation.</CardDescription></div>{current && <Badge variant="outline">{current.status}</Badge>}</div></CardHeader><CardContent className="space-y-4 p-5">{current ? <><Textarea className="report-print-content min-h-[380px] resize-y font-mono text-sm leading-6" value={text} onChange={event => { if (selectedId !== current.id) setSelectedId(current.id); setContent(event.target.value); }} /><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Base examinée : {Array.isArray(current.dataBasis) ? current.dataBasis.map((item: any) => item.label ?? item.source ?? "source").join(" · ") : "non précisée"}</p><div className="flex gap-2"><Button variant="outline" onClick={() => window.print()}>Imprimer / exporter en PDF</Button><Button onClick={() => update.mutate({ reportId: current.id, content: text })} disabled={update.isPending} className="bg-teal-700 hover:bg-teal-800">{update.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Enregistrer pour revue</Button></div></div></> : <p className="text-sm text-slate-500">Aucun contenu à éditer.</p>}</CardContent></Card></div>;
}

function AskCDEJView() {
  const ask = trpc.cdej.ask.useMutation({ onError: error => toast.error(error.message) });
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastSources, setLastSources] = useState<Array<{ type: string; label: string; id: number }>>([]);
  const [confidence, setConfidence] = useState<string>("");
  const send = (question: string) => {
    setMessages(current => [...current, { role: "user", content: question }]);
    ask.mutate({ question }, { onSuccess: result => { setMessages(current => [...current, { role: "assistant", content: result.answer }]); setLastSources(result.sources); setConfidence(result.confidence); } });
  };
  return <div className="grid gap-6 xl:grid-cols-[0.72fr_0.28fr]"><Card className="min-h-[650px] overflow-hidden border-slate-200"><div className="border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-teal-700 text-white"><Sparkles className="size-4" /></div><div><p className="font-semibold text-slate-900">Assistant encadré par les données</p><p className="text-xs text-slate-500">Réponses fondées sur les données validées et autorisées disponibles.</p></div></div></div><AIChatBox messages={messages} onSendMessage={send} isLoading={ask.isPending} height="570px" placeholder="Ex. Quels éléments exigent une attention prioritaire ?" emptyStateMessage="Posez une question sur les données disponibles dans votre CDEJ." suggestedPrompts={["Quels éléments exigent une attention prioritaire ?", "Quelles activités sont en retard ?", "Que montre la préparation FY28 ?"]} /></Card><div className="space-y-5"><Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Règles de réponse</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-slate-600"><div className="flex gap-3"><ShieldCheck className="mt-1 size-4 shrink-0 text-teal-700" />Contexte filtré par organisation, rôle, statut de validation et sensibilité.</div><div className="flex gap-3"><FileCheck2 className="mt-1 size-4 shrink-0 text-teal-700" />Sources exposées lorsque les éléments correspondants sont disponibles.</div><div className="flex gap-3"><AlertTriangle className="mt-1 size-4 shrink-0 text-amber-700" />Aucune décision finale, aucune donnée inventée et signalement des limites.</div></CardContent></Card>{lastSources.length > 0 && <Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Base examinée</CardTitle><CardDescription>Confiance : {confidence === "medium" ? "moyenne" : confidence === "high" ? "élevée" : confidence === "insufficient" ? "insuffisante" : "faible"}</CardDescription></CardHeader><CardContent className="space-y-2">{lastSources.slice(0, 8).map(source => <div key={`${source.type}-${source.id}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="font-medium text-slate-700">{source.type}</span><span className="ml-1 text-slate-500">— {source.label}</span></div>)}</CardContent></Card>}</div></div>;
}

function PlanningPoint({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail: string; icon: typeof Database }) { return <div className="rounded-xl border border-slate-200 bg-white/80 p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">{label}</p><Icon className="size-4 text-teal-700" /></div><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></div>; }
function StatusBadge({ value }: { value: string }) { const labels: Record<string, string> = { active: "Actif", at_risk: "À risque", achieved: "Atteint", completed: "Terminée", in_progress: "En cours", planned: "Prévue", delayed: "En retard", draft: "Brouillon", review: "À revoir", validated: "Validé", received: "Reçu", open: "Ouverte", blocked: "Bloquée", accepted: "Acceptée", modified: "Modifiée", rejected: "Rejetée", pending: "En attente" }; const tones = value === "delayed" || value === "at_risk" || value === "blocked" ? "border-rose-200 bg-rose-50 text-rose-800" : value === "validated" || value === "completed" || value === "achieved" || value === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"; return <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", tones)}>{labels[value] ?? value}</Badge>; }
function EmptyRow({ span, label }: { span: number; label: string }) { return <TableRow><TableCell colSpan={span} className="py-8 text-center text-sm text-slate-500">{label}</TableCell></TableRow>; }
function LoadingPanel({ label }: { label: string }) { return <div className="flex min-h-56 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />{label}</div>; }
function ErrorPanel({ message }: { message: string }) { return <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-900"><AlertTriangle className="mr-2 inline size-4" />{message}</div>; }

export default function CDEJApp() {
  const [location] = useLocation();
  const info = sectionTitle[location] ?? sectionTitle["/"];
  const workspace = trpc.cdej.workspace.useQuery();
  const page = useMemo(() => {
    if (location === "/hub") return <DataHubView />;
    if (location === "/importer") return <ImportView />;
    if (location === "/planification") return <PlanningView />;
    if (location === "/analyses") return <AnalyticsView />;
    if (location === "/workflows") return <WorkflowsView />;
    if (location === "/documents") return <ReportsView />;
    if (location === "/ask-cdej") return <AskCDEJView />;
    return <DashboardView />;
  }, [location]);
  return <div className="mx-auto max-w-[1540px] space-y-6"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-teal-700"><span className="size-1.5 rounded-full bg-teal-600" />Espace opérationnel</div><h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{info.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{info.description}</p></div><div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-xs"><p className="font-medium text-slate-800">{workspace.data?.organizationName ?? "Organisation en cours"}</p><p className="mt-0.5 text-slate-500">Rôle : {workspace.data?.roleCode ?? "chargement"}</p></div></header>{page}</div>;
}
