import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Candidates from "./pages/Candidates";
import Clients from "./pages/Clients";
import Jobs from "./pages/Jobs";
import BDPipeline from "./pages/BDPipeline";
import Coach from "./pages/Coach";
import Settings from "./pages/Settings";
import WeeklyIntel from "./pages/WeeklyIntel";
import CallsMeetings from "./pages/CallsMeetings";
import Auth from "./pages/Auth";
import Portal from "./pages/Portal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);

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
    return <OnboardingFlow onComplete={() => setOnboardingDone(true)} />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/bd-pipeline" element={<BDPipeline />} />
        <Route path="/coach" element={<Coach />} />
        <Route path="/weekly" element={<WeeklyIntel />} />
        <Route path="/calls" element={<CallsMeetings />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
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
