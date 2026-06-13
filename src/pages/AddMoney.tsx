import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Copy, Building2, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function AddMoney() {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`,
    });
  };

  const createVirtualAccount = async (force = false) => {
    console.log('[AddMoney] createVirtualAccount called, user:', !!user, 'profile:', !!profile);
    if (!user || !profile) {
      console.error('[AddMoney] Missing user or profile, cannot create virtual account');
      toast({
        title: 'Error',
        description: 'Please log in first to create a virtual account.',
        variant: 'destructive',
      });
      return;
    }

    if (force) setIsRegenerating(true);
    else setIsCreatingAccount(true);
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
          force,
        },
      });

      if (error) {
        console.error('Error creating virtual account:', error);
        toast({
          title: 'Error',
          description: 'Failed to create virtual account. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      if (data?.success) {
        toast({
          title: 'Success!',
          description: `Virtual account created: ${data.accountNumber}`,
        });
        // Refresh profile to get the new account number
        await refreshProfile();
      } else {
        toast({
          title: 'Error',
          description: data?.error || 'Failed to create virtual account',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingAccount(false);
      setIsRegenerating(false);
    }
  };

  const hasVirtualAccount = profile?.account_number && profile.account_number.length === 10;

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Add Money</h1>
        </div>

        <div className="px-4 pb-6">
          {/* Bank Transfer Card */}
          <div className="bg-card rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Building2 className="w-6 h-6 text-secondary-foreground" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Bank Transfer</h2>
                <p className="text-sm text-muted-foreground">Transfer to your account</p>
              </div>
            </div>

            {hasVirtualAccount ? (
              <div className="space-y-4">
                <div className="bg-secondary/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                       <p className="font-semibold text-foreground">
                         {(() => {
                           const name = profile?.virtual_account_name || "";
                           const b = profile?.virtual_account_bank || "Paga";
                           // Aspfiy-provisioned accounts always display as "Paga - Aspfiy",
                           // regardless of the underlying settlement bank (PalmPay, 9PSB, etc.)
                           const isAspfiy =
                             name.toLowerCase().startsWith("aspfiy") ||
                             ["paga", "palmpay"].includes(b.toLowerCase());
                           return isAspfiy ? "Paga - Aspfiy" : b;
                         })()}
                       </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                       onClick={() => {
                         const name = profile?.virtual_account_name || "";
                         const b = profile?.virtual_account_bank || "Paga";
                         const isAspfiy =
                           name.toLowerCase().startsWith("aspfiy") ||
                           ["paga", "palmpay"].includes(b.toLowerCase());
                         copyToClipboard(isAspfiy ? "Paga - Aspfiy" : b, "Bank name");
                       }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                      <p className="font-semibold text-foreground text-lg tracking-wide">
                        {profile?.account_number}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(profile?.account_number || '', 'Account number')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Account Name</p>
                      <p className="font-semibold text-foreground">
                        {(profile as any)?.virtual_account_name || profile?.full_name || 'User'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard((profile as any)?.virtual_account_name || profile?.full_name || '', 'Account name')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => createVirtualAccount(true)}
                  disabled={isRegenerating}
                  className="w-full"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate Account Number
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Having issues with your account number? Tap above to regenerate it.
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">
                  You don't have a virtual account yet. Create one to receive payments.
                </p>
                <Button 
                  onClick={() => createVirtualAccount(false)}
                  disabled={isCreatingAccount}
                  className="w-full"
                >
                  {isCreatingAccount ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Virtual Account'
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Info */}
          {hasVirtualAccount && (
            <div className="bg-accent/10 rounded-xl p-4">
              <p className="text-sm text-foreground">
                <span className="font-medium">Note:</span> Transfer any amount to the account above.
                Your wallet will be credited automatically within minutes.
              </p>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
