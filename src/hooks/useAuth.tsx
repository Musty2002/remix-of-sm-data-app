import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Wallet, CashbackWallet } from '@/types/database';

interface ExtendedProfile extends Profile {
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: ExtendedProfile | null;
  wallet: Wallet | null;
  cashbackWallet: CashbackWallet | null;
  loading: boolean;
  isBlocked: boolean;
  signUp: (email: string, password: string, fullName: string, phone: string, referralCode?: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  refreshCashbackWallet: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [cashbackWallet, setCashbackWallet] = useState<CashbackWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);

  const fetchProfile = async (userId: string, retryCount = 0): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, is_blocked, blocked_at, blocked_reason')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('fetchProfile error:', error);
        return;
      }
      
      if (data) {
        setProfile(data as ExtendedProfile);
        setIsBlocked(data.is_blocked === true);
      } else if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchProfile(userId, retryCount + 1);
      }
    } catch (err) {
      console.error('fetchProfile unexpected error:', err);
    }
  };

  const fetchWallet = async (userId: string, retryCount = 0): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('fetchWallet error:', error);
        return;
      }
      
      if (data) {
        setWallet(data as Wallet);
      } else if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchWallet(userId, retryCount + 1);
      }
    } catch (err) {
      console.error('fetchWallet unexpected error:', err);
    }
  };

  const fetchCashbackWallet = async (userId: string, retryCount = 0): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('cashback_wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('fetchCashbackWallet error:', error);
        return;
      }
      
      if (data) {
        setCashbackWallet(data as CashbackWallet);
      } else if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchCashbackWallet(userId, retryCount + 1);
      }
    } catch (err) {
      console.error('fetchCashbackWallet unexpected error:', err);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);
          
          // Defer Supabase calls with setTimeout
          if (session?.user) {
            setTimeout(() => {
              fetchProfile(session.user.id);
              fetchWallet(session.user.id);
              fetchCashbackWallet(session.user.id);
              // Auto-provision virtual account whenever the user signs in
              // (covers fresh signups, email-confirmation logins, and returning users)
              if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                ensureVirtualAccount(session.user.id, session.user);
              }
            }, 0);
          } else {
            setProfile(null);
            setWallet(null);
            setCashbackWallet(null);
          }
        } catch (err) {
          console.error('Auth state change error:', err);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      try {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
          fetchWallet(session.user.id);
          fetchCashbackWallet(session.user.id);
          // Auto-provision virtual account on app load if missing
          ensureVirtualAccount(session.user.id, session.user);
        }
      } catch (err) {
        console.error('Get session error:', err);
      }
      setLoading(false);
    }).catch((err) => {
      console.error('getSession failed:', err);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const createVirtualAccountWithRetry = async (
    userId: string,
    email: string,
    name: string,
    phoneNumber: string,
    maxRetries = 3,
    force = false
  ): Promise<void> => {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Sanitize phone number before sending
        let sanitizedPhone = (phoneNumber || "").replace(/[\s\-()]/g, "");
        if (sanitizedPhone.startsWith("+234")) {
          sanitizedPhone = "0" + sanitizedPhone.slice(4);
        } else if (sanitizedPhone.startsWith("234") && sanitizedPhone.length === 13) {
          sanitizedPhone = "0" + sanitizedPhone.slice(3);
        }
        
        console.log(`Creating virtual account (attempt ${attempt + 1}/${maxRetries}), phone: ${sanitizedPhone}...`);
        
        const { data: vaData, error: vaError } = await supabase.functions.invoke('create-virtual-account', {
          body: { userId, email, name, phoneNumber: sanitizedPhone, force }
        });
        
        if (vaError) {
          throw vaError;
        }
        
        console.log('Virtual account created successfully:', vaData);
        await fetchProfile(userId);
        return;
      } catch (err) {
        console.error(`Attempt ${attempt + 1} failed:`, err);
        
        if (attempt < maxRetries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.log(`Retrying in ${backoffMs / 1000}s...`);
          await delay(backoffMs);
        }
      }
    }
    
    console.error('All retry attempts failed for virtual account creation');
  };

  const signUp = async (email: string, password: string, fullName: string, phone: string, referralCode?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          phone: phone,
          referral_code: referralCode || null,
        }
      }
    });
    
    // If signup successful, automatically create virtual account with retry
    if (!error && data.user && data.session) {
      // Start the retry process in background (don't block signup)
      createVirtualAccountWithRetry(data.user.id, email, fullName, phone);
    }
    
    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const ensureVirtualAccount = async (userId: string, authenticatedUser?: User) => {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('virtual_account_name, virtual_account_bank, full_name, phone, email')
        .eq('user_id', userId)
        .maybeSingle();

      const bank = (prof?.virtual_account_bank || '').toLowerCase();
      const isPalmPay = bank.includes('palmpay');
      const missing = !prof || !prof.virtual_account_name;

      if (missing || !isPalmPay) {
        const currentUser = authenticatedUser || session?.user || user;
        const metadata = currentUser?.user_metadata || {};
        console.log(missing ? 'User missing virtual account, provisioning PalmPay...' : 'Migrating user to PalmPay virtual account...');
        createVirtualAccountWithRetry(
          userId,
          prof?.email || currentUser?.email || '',
          prof?.full_name || metadata.full_name || 'User',
          prof?.phone || metadata.phone || '',
          3,
          !missing // force regenerate for existing aspfiy users
        );
      }
    } catch (err) {
      console.error('ensureVirtualAccount error:', err);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Auto-create virtual account for all users who don't have one (including new signups after email verification)
    if (!error && data.user) {
      ensureVirtualAccount(data.user.id, data.user);
    }
    
    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setWallet(null);
    setCashbackWallet(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const refreshWallet = async () => {
    if (user) {
      await fetchWallet(user.id);
    }
  };

  const refreshCashbackWallet = async () => {
    if (user) {
      await fetchCashbackWallet(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      wallet,
      cashbackWallet,
      loading,
      isBlocked,
      signUp,
      signIn,
      signOut,
      refreshProfile,
      refreshWallet,
      refreshCashbackWallet,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
