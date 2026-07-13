import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { NativeProvider } from "@/components/NativeProvider";
import { SplashScreen } from "@/components/SplashScreen";
import { LockScreen } from "@/components/auth/LockScreen";
import { BlockedUserScreen } from "@/components/auth/BlockedUserScreen";
import { PinSetupDialog, isPinSetup } from "@/components/auth/PinSetupDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Services from "./pages/Services";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Referral from "./pages/Referral";
import Data from "./pages/Data";
import Airtime from "./pages/Airtime";
import Electricity from "./pages/Electricity";
import TV from "./pages/TV";
import Transfer from "./pages/Transfer";
import AddMoney from "./pages/AddMoney";
import BvnNin from "./pages/BvnNin";
import Notifications from "./pages/Notifications";
import Cashback from "./pages/Cashback";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import ExamPin from "./pages/ExamPin";
import ResellerPromo from "./pages/ResellerPromo";
import EditProfile from "./pages/EditProfile";
import Security from "./pages/Security";
import Support from "./pages/Support";
import Settings from "./pages/Settings";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Receipt from "./pages/Receipt";


// Admin Pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import UsersManagement from "./pages/admin/UsersManagement";
import TransactionsPage from "./pages/admin/TransactionsPage";
import NotificationsAdmin from "./pages/admin/NotificationsAdmin";
import PricingConfig from "./pages/admin/PricingConfig";
import DataPricingPage from "./pages/admin/DataPricingPage";
import TopResellersPage from "./pages/admin/TopResellersPage";
import WalletsPage from "./pages/admin/WalletsPage";
import ReferralsPage from "./pages/admin/ReferralsPage";
import SettingsPage from "./pages/admin/SettingsPage";
import PromoBannersPage from "./pages/admin/PromoBannersPage";
import { AdminProvider, useAdmin } from "@/hooks/useAdmin";


const queryClient = new QueryClient();

// Session lock state - persists across app lifetime
const SESSION_UNLOCKED_KEY = 'session_unlocked';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profile, isBlocked, signOut } = useAuth();
  const [isLocked, setIsLocked] = useState(true);
  const [checkingLock, setCheckingLock] = useState(true);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinSetupDismissed, setPinSetupDismissed] = useState(false);

  // Check if session was unlocked (in-memory for current app session)
  useEffect(() => {
    if (!loading && user) {
      const sessionUnlocked = sessionStorage.getItem(SESSION_UNLOCKED_KEY);
      if (sessionUnlocked === 'true') {
        setIsLocked(false);
      }
      setCheckingLock(false);
    } else if (!loading) {
      setCheckingLock(false);
    }
  }, [loading, user]);

  // Check if user needs to set up PIN (after unlock, on native platforms)
  useEffect(() => {
    if (!isLocked && user && !pinSetupDismissed) {
      try {
        if (!Capacitor.isNativePlatform()) return;
        const hasPinSetupAlready = isPinSetup();
        if (!hasPinSetupAlready) {
          const timer = setTimeout(() => {
            setShowPinSetup(true);
          }, 1500);
          return () => clearTimeout(timer);
        }
      } catch (err) {
        console.error('PIN setup check error:', err);
      }
    }
  }, [isLocked, user, pinSetupDismissed]);

  const handleUnlock = useCallback(() => {
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
    setIsLocked(false);
  }, []);

  const handleSwitchAccount = useCallback(async () => {
    try {
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      localStorage.removeItem('last_logged_in_user');
      localStorage.removeItem('biometric_auth_user');
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Switch account error:', err);
    }
  }, []);

  if (loading || checkingLock) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show blocked screen if user is suspended
  if (isBlocked) {
    return (
      <BlockedUserScreen
        reason={(profile as any)?.blocked_reason}
        onSignOut={signOut}
      />
    );
  }

  // Show lock screen if session is locked (on native platforms)
  if (isLocked && Capacitor.isNativePlatform()) {
    return (
      <LockScreen
        userEmail={user.email || ''}
        userName={profile?.full_name}
        onUnlock={handleUnlock}
        onSwitchAccount={handleSwitchAccount}
      />
    );
  }

  return (
    <>
      {children}
      <PinSetupDialog
        open={showPinSetup}
        onOpenChange={(open) => {
          setShowPinSetup(open);
          if (!open) setPinSetupDismissed(true);
        }}
        onComplete={() => {
          toast.success('PIN set up successfully! Your app is now secure.');
        }}
      />
    </>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAdmin();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
      <Route path="/data" element={<ProtectedRoute><Data /></ProtectedRoute>} />
      <Route path="/airtime" element={<ProtectedRoute><Airtime /></ProtectedRoute>} />
      <Route path="/electricity" element={<ProtectedRoute><Electricity /></ProtectedRoute>} />
      <Route path="/tv" element={<ProtectedRoute><TV /></ProtectedRoute>} />
      <Route path="/transfer" element={<ProtectedRoute><Transfer /></ProtectedRoute>} />
      <Route path="/add-money" element={<ProtectedRoute><AddMoney /></ProtectedRoute>} />
      <Route path="/bvn-nin" element={<ProtectedRoute><BvnNin /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/cashback" element={<ProtectedRoute><Cashback /></ProtectedRoute>} />
      <Route path="/exam-pin" element={<ProtectedRoute><ExamPin /></ProtectedRoute>} />
      <Route path="/reseller-promo" element={<ProtectedRoute><ResellerPromo /></ProtectedRoute>} />
      <Route path="/receipt/:transactionId" element={<ProtectedRoute><Receipt /></ProtectedRoute>} />
      <Route path="/profile/edit" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
      <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route
        path="/"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="top-resellers" element={<TopResellersPage />} />
        <Route path="notifications" element={<NotificationsAdmin />} />
        <Route path="pricing" element={<PricingConfig />} />
        <Route path="data-pricing" element={<DataPricingPage />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="referrals" element={<ReferralsPage />} />
        <Route path="promo-banners" element={<PromoBannersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}

function AppWithSplash() {
  // Client-side redirect for admin subdomain
  useEffect(() => {
    const hostname = window.location.hostname;
    if (hostname === 'admin.smdatasub.com.ng' && !window.location.pathname.startsWith('/admin')) {
      window.location.replace('/admin/login');
    }
  }, []);

  const [showSplash, setShowSplash] = useState(() => {
    const path = window.location.pathname;
    const hostname = window.location.hostname;
    const isAdminRoute = path.startsWith('/admin') || hostname === 'admin.smdatasub.com.ng';
    return !isAdminRoute;
  });

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} minDuration={2000} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes - completely separate */}
        <Route path="/admin/*" element={
          <AdminProvider>
            <AdminRoutes />
          </AdminProvider>
        } />
        
        {/* Main app routes */}
        <Route path="/*" element={
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <NativeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppWithSplash />
        </TooltipProvider>
      </NativeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
