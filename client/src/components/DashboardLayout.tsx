import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { BarChart3, CalendarRange, ClipboardCheck, Database, FileText, LayoutDashboard, LogOut, MessageSquareText, PanelLeft, UploadCloud, Workflow } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Vue d’ensemble", path: "/tableau-de-bord" },
  { icon: Database, label: "CDEJ Data Hub", path: "/hub" },
  { icon: UploadCloud, label: "Importer", path: "/importer" },
  { icon: CalendarRange, label: "Préparer FY", path: "/planification" },
  { icon: BarChart3, label: "Analyses", path: "/analyses" },
  { icon: Workflow, label: "Workflows", path: "/workflows" },
  { icon: FileText, label: "Rapports", path: "/documents" },
  { icon: MessageSquareText, label: "Ask CDEJ", path: "/ask-cdej" },
];
const SIDEBAR_WIDTH_KEY = "cdej-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><div className="mb-7 flex size-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-semibold text-white">C1</div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Accéder à CDEJ ONE</h1><p className="mt-3 text-sm leading-6 text-slate-600">Connectez-vous pour accéder à votre espace d’organisation, à vos droits et à l’historique des validations.</p><Button onClick={() => startLogin()} size="lg" className="mt-7 w-full bg-teal-700 hover:bg-teal-800">Se connecter de manière sécurisée</Button></div></div>;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (value: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [resizing, setResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    const move = (event: MouseEvent) => { if (!resizing) return; const left = sidebarRef.current?.getBoundingClientRect().left ?? 0; const width = event.clientX - left; if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width); };
    const up = () => setResizing(false);
    if (resizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; }
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
  }, [resizing, setSidebarWidth]);
  const active = menuItems.find(item => item.path === location) ?? menuItems[0];
  return <><div ref={sidebarRef} className="relative"><Sidebar collapsible="icon" className="border-r border-slate-800 bg-slate-950 text-slate-200"><SidebarHeader className="h-20 border-b border-slate-800 px-3"><div className="flex h-full items-center gap-3"><button onClick={() => undefined} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-sm font-semibold text-white">C1</button><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold tracking-wide text-white">CDEJ ONE</p><p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-400">Administration intelligente</p></div><PanelLeft className="ml-auto size-4 text-slate-500 group-data-[collapsible=icon]:hidden" /></div></SidebarHeader><SidebarContent className="px-2 py-4"><p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500 group-data-[collapsible=icon]:hidden">Pilotage</p><SidebarMenu>{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 text-slate-300 hover:bg-slate-800 hover:text-white data-[active=true]:bg-teal-700 data-[active=true]:text-white"><item.icon className="size-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="border-t border-slate-800 p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-slate-800 group-data-[collapsible=icon]:justify-center"><Avatar className="size-8 border border-slate-700"><AvatarFallback className="bg-slate-800 text-xs text-teal-100">{user?.name?.slice(0, 2).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-medium text-slate-200">{user?.name || "Utilisateur"}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">Espace sécurisé</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={logout} className="text-rose-700 focus:text-rose-700"><LogOut className="mr-2 size-4" />Se déconnecter</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><div className="absolute right-0 top-0 hidden h-full w-1 cursor-col-resize hover:bg-teal-500/50 lg:block" onMouseDown={() => setResizing(true)} /></div><SidebarInset className="bg-slate-50">{isMobile && <div className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur"><SidebarTrigger className="size-9 rounded-md" /><span className="text-sm font-medium text-slate-800">{active.label}</span></div>}<main className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</main></SidebarInset></>;
}
