import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Plus, History, RefreshCw, Gift, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export function AccountCard() {
  const { profile, wallet, cashbackWallet, user, refreshWallet, refreshProfile, refreshCashbackWallet } = useAuth();
  const [showBalance, setShowBalance] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('just now');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Real-time wallet balance subscription
  useEffect(() => {
    if (!user?.id) return;

    const walletChannel = supabase
      .channel('wallet-balance-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Wallet updated:', payload);
          refreshWallet();
          setLastUpdated('just now');
          toast({
            title: 'Balance Updated',
            description: 'Your wallet balance has been updated.',
          });
        }
      )
      .subscribe();

    const cashbackChannel = supabase
      .channel('cashback-wallet-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cashback_wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Cashback wallet updated:', payload);
          refreshCashbackWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(cashbackChannel);
    };
  }, [user?.id, refreshWallet, refreshCashbackWallet, toast]);

  // Update "last updated" time
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated((prev) => {
        if (prev === 'just now') return '1 min ago';
        const match = prev.match(/(\d+)/);
        if (match) {
          const mins = parseInt(match[1]) + 1;
          return `${mins} min ago`;
        }
        return prev;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const copyAccountNumber = () => {
    if (profile?.account_number) {
      navigator.clipboard.writeText(profile.account_number);
      toast({
        title: 'Copied!',
        description: 'Account number copied to clipboard',
      });
    }
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
    }).format(balance);
  };

  const hasVirtualAccount = profile?.account_number && profile.account_number.length === 10;
  const isAccountReady = hasVirtualAccount && profile?.virtual_account_name;
  const storedBank = profile?.virtual_account_bank || "Paga";
  const bankName = storedBank.toLowerCase() === "paga" ? "Paga - Aspfiy" : storedBank;
  const accountName = profile?.virtual_account_name || null;

  const canWithdrawCashback = (cashbackWallet?.balance || 0) >= 100;

  const retryVirtualAccountCreation = async () => {
    console.log('[AccountCard] retryVirtualAccountCreation called, user:', !!user, 'profile:', !!profile);
    if (!user || !profile) {
      console.error('[AccountCard] Missing user or profile, cannot retry');
      toast({
        title: 'Error',
        description: 'Please log in first.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsRetrying(true);
    try {
      // Sanitize phone number
      let phone = (profile.phone || "").replace(/[\s\-()]/g, "");
      if (phone.startsWith("+234")) {
        phone = "0" + phone.slice(4);
      } else if (phone.startsWith("234") && phone.length === 13) {
        phone = "0" + phone.slice(3);
      }

      const { data, error } = await supabase.functions.invoke('create-virtual-account', {
        body: {
          userId: user.id,
          email: profile.email || user.email,
          name: profile.full_name,
          phoneNumber: phone,
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Account Created!',
        description: 'Your virtual account has been set up successfully.',
      });

      // Refresh profile to get the new account details
      await refreshProfile();
    } catch (error: any) {
      console.error('Error creating virtual account:', error);
      toast({
        title: 'Failed to create account',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleWithdrawCashback = async () => {
    if (!canWithdrawCashback) {
      toast({
        title: 'Cannot Withdraw',
        description: 'Minimum cashback withdrawal is ₦100',
        variant: 'destructive',
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-cashback');

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Cashback Withdrawn!',
          description: data.message,
        });
        refreshWallet();
        refreshCashbackWallet();
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      console.error('Error withdrawing cashback:', error);
      toast({
        title: 'Withdrawal Failed',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="space-y-3 mx-4 md:mx-6">
      {/* Main Wallet Card */}
      <div className="gradient-primary rounded-2xl p-5 md:p-6 text-primary-foreground shadow-lg">
      {/* User Name */}
        <p className="text-sm opacity-90 mb-1">Hello,</p>
        <h2 className="text-lg font-bold mb-4">{profile?.full_name || 'User'}</h2>

        {/* Balance */}
        <div className="mb-4">
          <p className="text-xs opacity-75 mb-1">Available Balance</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl md:text-3xl font-bold">
              {showBalance ? formatBalance(wallet?.balance || 0) : '₦ ****'}
            </span>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-1 hover:bg-white/10 rounded"
            >
              {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Account Info */}
        {isAccountReady ? (
          <div className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3 mb-4">
            <div>
              <span className="text-xs opacity-75">{bankName}</span>
              <p className="text-sm font-semibold">{profile?.account_number}</p>
            </div>
            <button onClick={copyAccountNumber} className="p-2 hover:bg-white/10 rounded-lg">
              <Copy className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-3 mb-4">
            <span className="text-xs opacity-75">
              {isRetrying ? 'Creating account...' : 'Account not ready'}
            </span>
            <button
              onClick={retryVirtualAccountCreation}
              disabled={isRetrying}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50"
              title="Retry account creation"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => navigate('/add-money')}
            disabled={!isAccountReady}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Money
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => navigate('/history')}
          >
            <History className="w-4 h-4 mr-1" />
            History
          </Button>
        </div>
      </div>

      {/* Cashback Wallet Card */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs opacity-90">Cashback Balance</p>
              <p className="text-lg font-bold">
                {showBalance ? formatBalance(cashbackWallet?.balance || 0) : '₦ ****'}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={handleWithdrawCashback}
            disabled={!canWithdrawCashback || isWithdrawing}
          >
            {isWithdrawing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4 mr-1" />
                Withdraw
              </>
            )}
          </Button>
        </div>
        {!canWithdrawCashback && (cashbackWallet?.balance || 0) > 0 && (
          <p className="text-xs opacity-75 mt-2">
            Minimum ₦100 required to withdraw ({formatBalance(100 - (cashbackWallet?.balance || 0))} more needed)
          </p>
        )}
        <p className="text-xs opacity-75 mt-2">
          Earn ₦5/GB on data • ₦2/₦100 on airtime
        </p>
      </div>
    </div>
  );
}
