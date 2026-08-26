import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const configuredBase = import.meta.env.BASE_URL;
const basePath = configuredBase.endsWith("/") ? configuredBase.slice(0, -1) : configuredBase;

function Router() {
  return <WouterRouter base={basePath}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tableau-de-bord" component={Home} />
      <Route path="/hub" component={Home} />
      <Route path="/importer" component={Home} />
      <Route path="/planification" component={Home} />
      <Route path="/analyses" component={Home} />
      <Route path="/workflows" component={Home} />
      <Route path="/documents" component={Home} />
      <Route path="/ask-cdej" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  </WouterRouter>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
