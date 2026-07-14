import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdmin } from '@/hooks/useAdmin';
import { 
  LayoutDashboard, 
  Users, 
  Receipt, 
  Bell, 
  DollarSign, 
  Wallet, 
  Settings, 
  Gift,
  Image,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Trophy,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logo from '@/assets/sm-data-sub-logo.jpeg';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/admin/top-resellers', icon: Trophy, label: 'Top Resellers' },
  { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { to: '/admin/data-pricing', icon: DollarSign, label: 'Data Pricing' },
  { to: '/admin/profit', icon: TrendingUp, label: 'Profit & Reports' },
  { to: '/admin/wallets', icon: Wallet, label: 'Wallets' },
  { to: '/admin/referrals', icon: Gift, label: 'Referrals' },
  { to: '/admin/promo-banners', icon: Image, label: 'Promo Banners' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function AdminLayout() {
  const { user, signOut } = useAdmin();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 bg-gray-900 text-white transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-20",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-3">
            <img src={logo} alt="SM Data" className="w-10 h-10 rounded-lg" />
            {sidebarOpen && <span className="font-bold text-lg">Admin Panel</span>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-white hover:bg-gray-800"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
              onClick={() => setMobileMenuOpen(false)}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Collapse button (desktop) */}
        <div className="hidden lg:block p-4 border-t border-gray-800">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-gray-400 hover:text-white hover:bg-gray-800"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <ChevronLeft className={cn("w-5 h-5 transition-transform", !sidebarOpen && "rotate-180")} />
            {sidebarOpen && <span className="ml-2">Collapse</span>}
          </Button>
        </div>

        {/* User & Logout */}
        <div className="p-4 border-t border-gray-800">
          {sidebarOpen && (
            <p className="text-sm text-gray-400 mb-2 truncate">{user?.email}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center gap-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </Button>
          <img src={logo} alt="SM Data" className="w-8 h-8 rounded-lg" />
          <span className="font-bold">Admin Panel</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
