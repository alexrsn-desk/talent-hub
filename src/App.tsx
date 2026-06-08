import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { OnboardingImport } from "@/components/OnboardingImport";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, X } from "lucide-react";
import { TrialBanner } from "@/components/TrialBanner";
import Dashboard from "./pages/Dashboard";
import Candidates from "./pages/Candidates";
import Clients from "./pages/Clients";
import Contacts from "./pages/Contacts";
import Jobs from "./pages/Jobs";
import Placements from "./pages/Placements";
import BDPipeline from "./pages/BDPipeline";
import Coach from "./pages/Coach";
import Settings from "./pages/Settings";
import WeeklyIntel from "./pages/WeeklyIntel";
import CallsMeetings from "./pages/CallsMeetings";
import Sequences from "./pages/Sequences";
import Auth from "./pages/Auth";
import Portal from "./pages/Portal";
import LiveConversations from "./pages/LiveConversations";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ImportBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("import_banner_dismissed");
    const importDone = localStorage.getItem("import_completed");
    if (dismissed || importDone) return;

    // Show banner for 7 days after first login
    const firstSeen = localStorage.getItem("import_banner_first_seen");
    if (!firstSeen) {
      localStorage.setItem("import_banner_first_seen", new Date().toISOString());
      setVisible(true);
    } else {
      const daysSince = (Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= 7) setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">Ready to import your existing data? It takes 5 minutes.</span>
        <a href="/settings" className="text-primary font-medium hover:underline underline-offset-2">
          Import now →
        </a>
      </div>
      <button
        onClick={() => {
          localStorage.setItem("import_banner_dismissed", "true");
          setVisible(false);
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showImportStep, setShowImportStep] = useState(false);

  useEffect(() => {
    if (!user) {
      setCheckingOnboarding(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("recruiter_profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .single();
      setOnboardingDone(data?.onboarding_completed ?? false);
      setCheckingOnboarding(false);
    })();
  }, [user]);

  if (loading || (user && checkingOnboarding)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Portal route is public (token-based auth)
  if (window.location.pathname.startsWith("/portal")) {
    return (
      <Routes>
        <Route path="/portal" element={<Portal />} />
      </Routes>
    );
  }

  if (!user) return <Auth />;

  if (!onboardingDone) {
    return (
      <OnboardingFlow
        onComplete={() => {
          setOnboardingDone(true);
          setShowImportStep(true);
        }}
      />
    );
  }

  // Show import step right after onboarding completes
  if (showImportStep) {
    return (
      <OnboardingImport
        onComplete={() => {
          localStorage.setItem("import_completed", "true");
          setShowImportStep(false);
        }}
      />
    );
  }

  return (
    <>
      <TrialBanner />
      <ImportBanner />
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<LiveConversations />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/placements" element={<Placements />} />
          <Route path="/bd-pipeline" element={<BDPipeline />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/weekly" element={<WeeklyIntel />} />
          <Route path="/calls" element={<CallsMeetings />} />
          <Route path="/sequences" element={<Sequences />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
