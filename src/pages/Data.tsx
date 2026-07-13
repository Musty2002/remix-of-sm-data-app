import { useState, useEffect } from 'react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ArrowLeft, Check, Loader2, ChevronRight } from 'lucide-react';
import { PhoneInputWithContacts } from '@/components/PhoneInputWithContacts';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TransactionReceipt } from '@/components/TransactionReceipt';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { TransactionVerifyDialog } from '@/components/auth/TransactionVerifyDialog';
// Import network logos
import mtnLogo from '@/assets/networks/mtn-logo.png';
import airtelLogo from '@/assets/networks/airtel-logo.png';
import gloLogo from '@/assets/networks/glo-logo.png';
import nineMobileLogo from '@/assets/networks/9mobile-logo.png';

interface DataService {
  id: number;
  product_id: number;
  service: string;
  amount: string;
  name: string;
  category: string;
  available: boolean;
  provider?: 'rgc' | 'bonanza';
  validity?: string | null;
}

type Step = 'network' | 'category' | 'plan' | 'confirm';

const networkLogos: Record<string, string> = {
  'MTN': mtnLogo,
  'Airtel': airtelLogo,
  'Glo': gloLogo,
  '9mobile': nineMobileLogo,
};

const networkColors: Record<string, string> = {
  'MTN': 'bg-yellow-400/10 border-yellow-400',
  'Airtel': 'bg-red-500/10 border-red-500',
  'Glo': 'bg-green-500/10 border-green-500',
  '9mobile': 'bg-emerald-600/10 border-emerald-600',
};

const getNetworkGroup = (category: string): string => {
  const upper = category.toUpperCase();
  if (upper.includes('MTN')) return 'MTN';
  if (upper.includes('AIRTEL')) return 'Airtel';
  if (upper.includes('GLO')) return 'Glo';
  if (upper.includes('9MOBILE') || upper.includes('ETISALAT')) return '9mobile';
  return category;
};

const getCategoryDisplayName = (category: string): string => {
  // Remove network name prefix for cleaner display
  const cleaned = category
    .replace(/MTN\s*/i, '')
    .replace(/AIRTEL\s*/i, '')
    .replace(/GLO\s*/i, '')
    .replace(/9mobile\s*/i, '')
    .trim();
  return cleaned || category;
};

export default function Data() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [allBundles, setAllBundles] = useState<DataService[]>([]);
  const [step, setStep] = useState<Step>('network');
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<DataService | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{
    id: string;
    date: Date;
    phoneNumber: string;
    network: string;
    amount: number;
    type: 'airtime' | 'data';
    dataPlan?: string;
  } | null>(null);

  useEffect(() => {
    fetchDataBundles();
  }, []);

  // Prefill last used phone number
  useEffect(() => {
    const saved = localStorage.getItem('lastDataPhone');
    if (saved) setPhoneNumber(saved);
  }, []);

  const fetchDataBundles = async () => {
    try {
      setLoading(true);
      
      // ONLY fetch saved/imported bundles from database - these are the only ones that appear in the app
      const { data: savedBundles, error: dbError } = await supabase
        .from('data_bundles')
        .select('*')
        .eq('is_active', true);

      if (dbError) {
        throw dbError;
      }

      if (!savedBundles || savedBundles.length === 0) {
        setAllBundles([]);
        return;
      }

      // Deduplicate by normalized name + category to avoid showing same plan twice
      const bundlesMap = new Map<string, DataService>();
      
      const createDedupKey = (name: string, category: string) => {
        const normalizedName = name.toUpperCase().replace(/\s+/g, ' ').trim();
        return `${normalizedName}|${category}`;
      };

      savedBundles.forEach(bundle => {
        const dedupKey = createDedupKey(bundle.plan_name, bundle.data_type);
        
        // Only add if not already in map (first one wins - avoids duplicates)
        if (!bundlesMap.has(dedupKey)) {
          const provider = (bundle.provider === 'bonanza' ? 'bonanza' : 'rgc') as 'rgc' | 'bonanza';

          bundlesMap.set(dedupKey, {
            id: parseInt(bundle.plan_code) || 0,
            product_id: parseInt(bundle.plan_code) || 0,
            service: bundle.data_type,
            name: bundle.plan_name,
            amount: String(bundle.app_price),
            category: bundle.data_type,
            available: bundle.is_active ?? true,
            provider,
            validity: bundle.validity ?? null,
          });
        }
      });

      setAllBundles(Array.from(bundlesMap.values()));
    } catch (error: any) {
      console.error('Error fetching data bundles:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load data bundles. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const initiateTransaction = () => {
    if (!selectedNetwork || !selectedBundle || !phoneNumber) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in all fields',
      });
      return;
    }
    // Show verification dialog
    setShowVerifyDialog(true);
  };

  const handlePurchase = async () => {
    setShowVerifyDialog(false);
    setPurchasing(true);
    try {
      if (!selectedBundle || !selectedNetwork) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Please select a data plan first.',
        });
        setPurchasing(false);
        return;
      }
      // Route to appropriate provider based on bundle provider
      const provider = selectedBundle.provider || 'rgc';
      const functionName = provider === 'bonanza' ? 'bonanza-services' : 'rgc-services';

      console.log(`Purchasing via ${provider} provider`);

      // Build request body based on provider
      const requestBody: any = {
        action: 'purchase',
        serviceType: 'data',
        plan: selectedBundle.id,
        plan_name: selectedBundle.name,
        mobile_number: phoneNumber,
        amount: parseFloat(selectedBundle.amount),
        network: selectedNetwork,
      };

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: requestBody
      });

      if (error) {
        const message = await getEdgeFunctionErrorMessage(error);
        throw new Error(message || 'Purchase failed');
      }

      if (!data?.success) {
        throw new Error(data?.message || 'Purchase failed');
      }

      setLastTransaction({
        id: data.data?.reference || data.reference || `TXN-${Date.now()}`,
        date: new Date(),
        phoneNumber,
        network: selectedNetwork!.toUpperCase(),
        amount: parseFloat(selectedBundle.amount),
        type: 'data',
        dataPlan: selectedBundle.name,
      });
      try { localStorage.setItem('lastDataPhone', phoneNumber); } catch {}
      setShowReceipt(true);
      setSelectedBundle(null);
      setSelectedCategory(null);
      setSelectedNetwork(null);
      setStep('network');
    } catch (error: any) {
      console.error('Purchase error:', error);

      let title = 'Purchase Failed';
      let description = error.message || 'Unable to complete purchase. Please try again.';

      if (error.message === 'Insufficient balance') {
        title = 'Insufficient Balance';
        description = "You don't have enough funds in your wallet. Please top up and try again.";
      }

      toast({
        variant: 'destructive',
        title,
        description,
      });
    } finally {
      setPurchasing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(price);
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('plan');
    } else if (step === 'plan') {
      setSelectedBundle(null);
      setStep('category');
    } else if (step === 'category') {
      setSelectedCategory(null);
      setStep('network');
    } else {
      navigate('/dashboard');
    }
  };

  // Get unique network groups
  const networkGroups = [...new Set(allBundles.map(b => getNetworkGroup(b.category)))];

  // Get categories for selected network
  const networkCategories = selectedNetwork
    ? [...new Set(allBundles
        .filter(b => getNetworkGroup(b.category) === selectedNetwork)
        .map(b => b.category))]
    : [];

  // Get bundles for selected category
  const categoryBundles = selectedCategory
    ? allBundles.filter(b => b.category === selectedCategory)
        .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))
    : [];

  const getStepTitle = () => {
    switch (step) {
      case 'network': return 'Select Network';
      case 'category': return `${selectedNetwork} Data Plans`;
      case 'plan': return getCategoryDisplayName(selectedCategory || '');
      case 'confirm': return 'Confirm Purchase';
      default: return 'Buy Data';
    }
  };

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-4 border-b border-border">
          <button onClick={handleBack} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground">{getStepTitle()}</h1>
        </div>

        <div className="px-4 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Step 1: Network Selection */}
              {step === 'network' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose your mobile network provider
                  </p>
                  {networkGroups.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-2">No Data Plans Available</h3>
                      <p className="text-sm text-muted-foreground">
                        Data plans are currently being configured. Please check back soon.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {networkGroups.map((network) => (
                        <button
                          key={network}
                          onClick={() => {
                            setSelectedNetwork(network);
                            setStep('category');
                          }}
                          className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 hover:scale-[1.02] active:scale-[0.98] ${networkColors[network] || 'border-border bg-card'}`}
                        >
                          <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center shadow-sm overflow-hidden">
                            {networkLogos[network] ? (
                              <img 
                                src={networkLogos[network]} 
                                alt={network} 
                                className="w-12 h-12 object-contain rounded-lg"
                              />
                            ) : (
                              <span className="text-lg font-bold">{network.charAt(0)}</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-foreground">{network}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Category Selection */}
              {step === 'category' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm overflow-hidden">
                      {networkLogos[selectedNetwork!] ? (
                        <img 
                          src={networkLogos[selectedNetwork!]} 
                          alt={selectedNetwork!} 
                          className="w-7 h-7 object-contain rounded-md"
                        />
                      ) : (
                        <span className="text-sm font-bold">{selectedNetwork?.charAt(0)}</span>
                      )}
                    </div>
                    <span className="font-medium text-foreground">{selectedNetwork}</span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">
                    Select a data plan type
                  </p>

                  {networkCategories.map((category) => {
                    const bundleCount = allBundles.filter(b => b.category === category).length;
                    return (
                      <button
                        key={category}
                        onClick={() => {
                          setSelectedCategory(category);
                          setStep('plan');
                        }}
                        className="w-full p-4 rounded-xl border border-border bg-card hover:bg-accent/50 transition-all flex items-center justify-between group"
                      >
                        <div className="text-left">
                          <p className="font-semibold text-foreground">{getCategoryDisplayName(category)}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {bundleCount} plans available
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Step 3: Plan Selection */}
              {step === 'plan' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm overflow-hidden">
                      {networkLogos[selectedNetwork!] ? (
                        <img 
                          src={networkLogos[selectedNetwork!]} 
                          alt={selectedNetwork!} 
                          className="w-7 h-7 object-contain rounded-md"
                        />
                      ) : (
                        <span className="text-sm font-bold">{selectedNetwork?.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">{selectedNetwork}</span>
                      <p className="text-xs text-muted-foreground">{getCategoryDisplayName(selectedCategory!)}</p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2">
                    Select a data bundle
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {categoryBundles.map((bundle) => (
                      <button
                        key={bundle.id}
                        onClick={() => {
                          setSelectedBundle(bundle);
                          setStep('confirm');
                        }}
                        className="p-4 rounded-xl border border-border bg-card hover:border-primary hover:bg-primary/5 text-left transition-all"
                      >
                        <p className="text-base font-bold text-foreground leading-tight">{bundle.name}</p>
                        <p className="text-sm font-semibold text-primary mt-2">
                          {formatPrice(parseFloat(bundle.amount))}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Confirmation */}
              {step === 'confirm' && selectedBundle && (
                <div className="space-y-6">
                  {/* Selected Plan Summary */}
                  <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm overflow-hidden">
                        {networkLogos[selectedNetwork!] ? (
                          <img 
                            src={networkLogos[selectedNetwork!]} 
                            alt={selectedNetwork!} 
                            className="w-8 h-8 object-contain rounded-lg"
                          />
                        ) : (
                          <span className="font-bold">{selectedNetwork?.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{selectedNetwork}</p>
                        <p className="text-xs text-muted-foreground">{getCategoryDisplayName(selectedCategory!)}</p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-border">
                      <p className="text-lg font-bold text-foreground">{selectedBundle.name}</p>
                      <p className="text-xl font-bold text-primary mt-1">
                        {formatPrice(parseFloat(selectedBundle.amount))}
                      </p>
                    </div>
                  </div>

                  {/* Phone Number Input */}
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <PhoneInputWithContacts
                      id="phone"
                      placeholder="Enter your phone number"
                      value={phoneNumber}
                      onChange={setPhoneNumber}
                      className="mt-2"
                    />
                  </div>

                  {/* Purchase Button */}
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={initiateTransaction}
                    disabled={!phoneNumber || purchasing}
                  >
                    {purchasing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Buy ${selectedBundle.name}`
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Transaction Verification Dialog */}
      <TransactionVerifyDialog
        open={showVerifyDialog}
        onOpenChange={setShowVerifyDialog}
        onVerified={handlePurchase}
        title="Verify Purchase"
        description="Verify your identity to complete this data purchase"
        amount={selectedBundle ? parseFloat(selectedBundle.amount) : 0}
      />

      {/* Transaction Receipt Modal */}
      {lastTransaction && (
        <TransactionReceipt
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          transaction={lastTransaction}
        />
      )}
    </MobileLayout>
  );
}
