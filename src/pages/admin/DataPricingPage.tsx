import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2,
  Save,
  Database,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Check,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface DataBundle {
  id: string;
  network_code: string;
  data_type: string;
  plan_code: string;
  plan_name: string;
  validity: string | null;
  api_price: number;
  app_price: number;
  is_active: boolean;
  provider?: string | null;
}

interface APIDataBundle {
  id: number;
  product_id: number;
  service: string;
  amount: string;
  name: string;
  category: string;
  available: boolean;
  provider: 'rgc' | 'bonanza';
  validity?: string;
}

const networks = [
  { code: 'MTN', name: 'MTN' },
  { code: 'AIRTEL', name: 'Airtel' },
  { code: 'GLO', name: 'Glo' },
  { code: '9MOBILE', name: '9Mobile' },
];

const providers = [
  { code: 'rgc', name: 'RGC' },
  { code: 'bonanza', name: 'Bonanza' },
];

export default function DataPricingPage() {
  const [bundles, setBundles] = useState<DataBundle[]>([]);
  const [apiBundles, setApiBundles] = useState<APIDataBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('MTN');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [editedItems, setEditedItems] = useState<Record<string, Partial<DataBundle>>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newBundle, setNewBundle] = useState({
    plan_code: '',
    plan_name: '',
    validity: '',
    api_price: 0,
    app_price: 0,
    provider: 'rgc' as 'rgc' | 'bonanza',
  });
  const [selectedForImport, setSelectedForImport] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'database' | 'api'>('api');

  useEffect(() => {
    fetchFromAPI();
  }, []);

  useEffect(() => {
    if (viewMode === 'database') {
      fetchBundles();
    }
  }, [selectedNetwork, selectedCategory, selectedProvider, viewMode]);

  // Fetch bundles from RGC API
  const fetchFromAPI = async () => {
    setSyncing(true);
    try {
      const [rgcResponse, bonanzaResponse] = await Promise.all([
        supabase.functions.invoke('rgc-services', {
          body: { action: 'get-services', serviceType: 'data' }
        }).catch((e) => ({ data: null, error: e })),
        supabase.functions.invoke('bonanza-services', {
          body: { action: 'get-services', serviceType: 'data' }
        }).catch((e) => ({ data: null, error: e })),
      ]);

      let bundles: APIDataBundle[] = [];

      if (rgcResponse?.data?.success && rgcResponse.data?.data) {
        const rgcBundles = rgcResponse.data.data
          .filter((b: APIDataBundle) => b.available)
          .map((b: APIDataBundle) => ({ ...b, provider: 'rgc' as const }));
        bundles = [...bundles, ...rgcBundles];
      }

      if (bonanzaResponse?.data?.success && Array.isArray(bonanzaResponse.data?.data)) {
        const bonanzaBundles = bonanzaResponse.data.data
          .filter((b: any) => b.available !== false)
          .map((b: any) => ({
            id: b.id,
            product_id: b.product_id || b.id,
            service: b.service || 'DATA',
            amount: String(b.amount),
            name: b.name,
            category: b.category,
            available: true,
            provider: 'bonanza' as const,
            validity: b.validity,
          }));
        bundles = [...bundles, ...bonanzaBundles];
      }

      setApiBundles(bundles);
      
      // Auto-select first category if available
      const networkBundles = bundles.filter(b => getNetworkGroup(b.category) === selectedNetwork);
      const categories = [...new Set(networkBundles.map(b => b.category))];
      if (categories.length > 0 && !selectedCategory) {
        setSelectedCategory(categories[0]);
      }

      toast.success(`Loaded ${bundles.length} bundles from API`);
    } catch (error: any) {
      console.error('Error fetching from API:', error);
      toast.error('Failed to fetch from API');
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  const fetchBundles = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('data_bundles')
        .select('*')
        .eq('network_code', selectedNetwork)
        .order('api_price', { ascending: true });

      if (selectedCategory) {
        query = query.eq('data_type', selectedCategory);
      }

      // Apply provider filter
      if (selectedProvider && selectedProvider !== 'all') {
        query = query.eq('provider', selectedProvider);
      }

      const { data, error } = await query;

      if (error) throw error;
      setBundles(data || []);
      setEditedItems({});
    } catch (error) {
      console.error('Error fetching bundles:', error);
      toast.error('Failed to load data bundles');
    } finally {
      setLoading(false);
    }
  };

  const getNetworkGroup = (category: string): string => {
    const upper = category.toUpperCase();
    if (upper.includes('MTN')) return 'MTN';
    if (upper.includes('AIRTEL')) return 'AIRTEL';
    if (upper.includes('GLO')) return 'GLO';
    if (upper.includes('9MOBILE') || upper.includes('ETISALAT')) return '9MOBILE';
    return category;
  };

  const handleChange = (id: string, field: keyof DataBundle, value: any) => {
    setEditedItems(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const getDisplayValue = (item: DataBundle, field: keyof DataBundle) => {
    if (editedItems[item.id]?.[field] !== undefined) {
      return editedItems[item.id][field];
    }
    return item[field];
  };

  const saveChanges = async () => {
    if (Object.keys(editedItems).length === 0) {
      toast.info('No changes to save');
      return;
    }

    setSaving(true);
    try {
      for (const [id, changes] of Object.entries(editedItems)) {
        const { error } = await supabase
          .from('data_bundles')
          .update(changes)
          .eq('id', id);

        if (error) throw error;
      }

      toast.success('Prices updated successfully');
      setEditedItems({});
      fetchBundles();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Create unique key for bundle (provider-id)
  const getBundleKey = (bundle: APIDataBundle) => `${bundle.provider}-${bundle.id}`;

  const importSelectedBundles = async () => {
    if (selectedForImport.size === 0) {
      toast.error('Select bundles to import');
      return;
    }

    setSaving(true);
    try {
      const bundlesToImport = apiBundles.filter(b => selectedForImport.has(getBundleKey(b)));
      
      for (const bundle of bundlesToImport) {
        const networkCode = getNetworkGroup(bundle.category);
        const apiPrice = parseFloat(bundle.amount);
        
        // Check if already exists (by provider, plan_code and category)
        const { data: existing } = await supabase
          .from('data_bundles')
          .select('id')
          .eq('plan_code', bundle.id.toString())
          .eq('data_type', bundle.category)
          .eq('provider', bundle.provider)
          .single();

        if (existing) {
          // Update existing
          await supabase
            .from('data_bundles')
            .update({
              api_price: apiPrice,
              plan_name: bundle.name,
              validity: bundle.validity ?? null,
            })
            .eq('id', existing.id);
        } else {
          // Insert new with provider info
          await supabase
            .from('data_bundles')
            .insert({
              network_code: networkCode,
              data_type: bundle.category,
              plan_code: bundle.id.toString(),
              plan_name: bundle.name,
              validity: bundle.validity ?? null,
              api_price: apiPrice,
              app_price: apiPrice, // Default to API price, admin can adjust
              is_active: true,
              provider: bundle.provider, // Store which API provider this bundle is from
            });
        }
      }

      toast.success(`Imported ${bundlesToImport.length} bundles`);
      setSelectedForImport(new Set());
      fetchBundles();
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.error('Failed to import bundles');
    } finally {
      setSaving(false);
    }
  };

  const importAllVisible = async () => {
    const visibleBundles = filteredApiBundles;
    if (visibleBundles.length === 0) {
      toast.error('No bundles to import');
      return;
    }

    if (!confirm(`Import all ${visibleBundles.length} bundles from ${selectedCategory}?`)) return;

    setSaving(true);
    try {
      for (const bundle of visibleBundles) {
        const networkCode = getNetworkGroup(bundle.category);
        const apiPrice = parseFloat(bundle.amount);
        
        // Check if already exists
        const { data: existing } = await supabase
          .from('data_bundles')
          .select('id')
          .eq('plan_code', bundle.id.toString())
          .eq('data_type', bundle.category)
          .single();

        if (existing) {
          await supabase
            .from('data_bundles')
            .update({
              api_price: apiPrice,
              plan_name: bundle.name,
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('data_bundles')
            .insert({
              network_code: networkCode,
              data_type: bundle.category,
              plan_code: bundle.id.toString(),
              plan_name: bundle.name,
              api_price: apiPrice,
              app_price: apiPrice,
              is_active: true,
              provider: bundle.provider, // Store which API provider this bundle is from
            });
        }
      }

      toast.success(`Imported ${visibleBundles.length} bundles`);
      setViewMode('database');
      fetchBundles();
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.error('Failed to import bundles');
    } finally {
      setSaving(false);
    }
  };

  const addNewBundle = async () => {
    if (!newBundle.plan_code || !newBundle.plan_name) {
      toast.error('Please fill in plan code and name');
      return;
    }

    try {
      const { error } = await supabase
        .from('data_bundles')
        .insert({
          network_code: selectedNetwork,
          data_type: selectedCategory || 'SME',
          ...newBundle
        });

      if (error) throw error;

      toast.success('Bundle added successfully');
      setAddDialogOpen(false);
      setNewBundle({ plan_code: '', plan_name: '', validity: '', api_price: 0, app_price: 0, provider: 'rgc' });
      fetchBundles();
    } catch (error: any) {
      console.error('Error adding bundle:', error);
      toast.error(error.message || 'Failed to add bundle');
    }
  };

  const deleteBundle = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bundle?')) return;

    try {
      const { error } = await supabase
        .from('data_bundles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Bundle deleted');
      fetchBundles();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete bundle');
    }
  };

  const hasChanges = Object.keys(editedItems).length > 0;

  // Get categories from API bundles for selected network, filtered by provider
  const networkApiBundles = apiBundles.filter(b => {
    const matchesNetwork = getNetworkGroup(b.category) === selectedNetwork;
    const matchesProvider = selectedProvider === 'all' || b.provider === selectedProvider;
    return matchesNetwork && matchesProvider;
  });
  const apiCategories = [...new Set(networkApiBundles.map(b => b.category))];

  // Filter API bundles by selected category and provider
  const filteredApiBundles = (() => {
    let result = apiBundles;
    if (selectedCategory) {
      result = result.filter(b => b.category === selectedCategory);
    }
    if (selectedProvider !== 'all') {
      result = result.filter(b => b.provider === selectedProvider);
    }
    return result.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
  })();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const toggleSelection = (bundleKey: string) => {
    setSelectedForImport(prev => {
      const next = new Set(prev);
      if (next.has(bundleKey)) {
        next.delete(bundleKey);
      } else {
        next.add(bundleKey);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allKeys = new Set(filteredApiBundles.map(b => getBundleKey(b)));
    setSelectedForImport(allKeys);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Pricing</h1>
          <p className="text-gray-500">Manage data bundle prices from API providers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchFromAPI} disabled={syncing}>
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh API
          </Button>
          {viewMode === 'database' && (
            <Button onClick={saveChanges} disabled={saving || !hasChanges}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        <Button 
          variant={viewMode === 'api' ? 'default' : 'outline'}
          onClick={() => setViewMode('api')}
        >
          <Database className="w-4 h-4 mr-2" />
          API Bundles ({apiBundles.length})
        </Button>
        <Button 
          variant={viewMode === 'database' ? 'default' : 'outline'}
          onClick={() => setViewMode('database')}
        >
          <Database className="w-4 h-4 mr-2" />
          Saved Bundles ({bundles.length})
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label className="mb-2 block">Network</Label>
              <Select value={selectedNetwork} onValueChange={(v) => {
                setSelectedNetwork(v);
                setSelectedCategory('');
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {networks.map(n => (
                    <SelectItem key={n.code} value={n.code}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Category (from API)</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {apiCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat} ({apiBundles.filter(b => b.category === cat && (selectedProvider === 'all' || b.provider === selectedProvider)).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Provider</Label>
              <Select value={selectedProvider} onValueChange={(v) => {
                setSelectedProvider(v);
                setSelectedCategory('');
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.code} value={p.code}>
                      <div className="flex items-center gap-2">
                        <Filter className="w-3 h-3" />
                        {p.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {viewMode === 'api' && (
              <div className="flex items-end gap-2">
                <Button onClick={selectAll} variant="outline" disabled={filteredApiBundles.length === 0}>
                  Select All
                </Button>
                <Button onClick={importSelectedBundles} disabled={selectedForImport.size === 0 || saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Import ({selectedForImport.size})
                </Button>
              </div>
            )}
            {viewMode === 'database' && (
              <div className="flex items-end">
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Bundle
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Data Bundle</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Plan Code</Label>
                        <Input
                          value={newBundle.plan_code}
                          onChange={(e) => setNewBundle(prev => ({ ...prev, plan_code: e.target.value }))}
                          placeholder="e.g., MTN500MB"
                        />
                      </div>
                      <div>
                        <Label>Plan Name</Label>
                        <Input
                          value={newBundle.plan_name}
                          onChange={(e) => setNewBundle(prev => ({ ...prev, plan_name: e.target.value }))}
                          placeholder="e.g., 500MB"
                        />
                      </div>
                      <div>
                        <Label>Validity</Label>
                        <Input
                          value={newBundle.validity}
                          onChange={(e) => setNewBundle(prev => ({ ...prev, validity: e.target.value }))}
                          placeholder="e.g., 30 days"
                        />
                      </div>
                      <div>
                        <Label>Provider</Label>
                        <Select
                          value={newBundle.provider}
                          onValueChange={(v) => setNewBundle(prev => ({ ...prev, provider: v as 'rgc' | 'bonanza' }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {providers.map(p => (
                              <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>API Price (₦)</Label>
                          <Input
                            type="number"
                            value={newBundle.api_price}
                            onChange={(e) => setNewBundle(prev => ({ ...prev, api_price: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div>
                          <Label>App Price (₦)</Label>
                          <Input
                            type="number"
                            value={newBundle.app_price}
                            onChange={(e) => setNewBundle(prev => ({ ...prev, app_price: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                      </div>
                      <Button onClick={addNewBundle} className="w-full">Add Bundle</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Bundles View */}
      {viewMode === 'api' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Live API Prices - {selectedCategory || 'Select a category'}
              </CardTitle>
              {filteredApiBundles.length > 0 && (
                <Button onClick={importAllVisible} disabled={saving} size="sm">
                  Import All ({filteredApiBundles.length})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading || syncing ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : !selectedCategory ? (
              <div className="text-center py-8 text-gray-500">
                Select a network and category to view bundles
              </div>
            ) : filteredApiBundles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No bundles found for this category
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedForImport.size === filteredApiBundles.length && filteredApiBundles.length > 0}
                          onChange={() => {
                            if (selectedForImport.size === filteredApiBundles.length) {
                              setSelectedForImport(new Set());
                            } else {
                              selectAll();
                            }
                          }}
                          className="rounded"
                        />
                      </TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Plan Name</TableHead>
                      <TableHead>API Price</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApiBundles.map((bundle) => {
                      const bundleKey = getBundleKey(bundle);
                      return (
                        <TableRow key={bundleKey} className={selectedForImport.has(bundleKey) ? 'bg-primary/5' : ''}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedForImport.has(bundleKey)}
                              onChange={() => toggleSelection(bundleKey)}
                              className="rounded"
                            />
                          </TableCell>
                        <TableCell className="font-mono text-sm">{bundle.id}</TableCell>
                        <TableCell className="font-medium">{bundle.name}</TableCell>
                        <TableCell className="font-semibold text-primary">
                          {formatPrice(parseFloat(bundle.amount))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{(bundle.provider || 'rgc').toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          {bundle.available ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <Check className="w-3 h-3 mr-1" />
                              Available
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              Unavailable
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      );
                    })}

                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Database Bundles View */}
      {viewMode === 'database' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Saved Bundles - {selectedNetwork}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : bundles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No bundles saved yet.</p>
                <p className="text-sm mt-2">Switch to "API Bundles" view and import bundles first.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan Code</TableHead>
                      <TableHead>Plan Name</TableHead>
                      <TableHead>Validity</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>API Price (₦)</TableHead>
                      <TableHead>App Price (₦)</TableHead>
                      <TableHead>Profit (₦)</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bundles.map((bundle) => {
                      const apiPrice = Number(getDisplayValue(bundle, 'api_price'));
                      const appPrice = Number(getDisplayValue(bundle, 'app_price'));
                      const profit = appPrice - apiPrice;

                      return (
                        <TableRow key={bundle.id} className={editedItems[bundle.id] ? 'bg-yellow-50' : ''}>
                          <TableCell className="font-mono text-sm">{bundle.plan_code}</TableCell>
                          <TableCell className="font-medium">
                            <Input
                              className="w-40"
                              value={(getDisplayValue(bundle, 'plan_name') as string) ?? ''}
                              onChange={(e) => handleChange(bundle.id, 'plan_name', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-28"
                              value={(getDisplayValue(bundle, 'validity') as string) ?? ''}
                              onChange={(e) => handleChange(bundle.id, 'validity', e.target.value)}
                              placeholder="e.g. 30 days"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{bundle.data_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{(bundle.provider || 'rgc').toUpperCase()}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatPrice(bundle.api_price)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              className="w-28"
                              value={getDisplayValue(bundle, 'app_price') as number}
                              onChange={(e) => handleChange(bundle.id, 'app_price', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className={profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {profit >= 0 ? '+' : ''}{formatPrice(profit)}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={getDisplayValue(bundle, 'is_active') as boolean}
                              onCheckedChange={(checked) => handleChange(bundle.id, 'is_active', checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteBundle(bundle.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {hasChanges && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                You have unsaved changes. Click "Save Changes" to apply.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Help Card */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p><strong>1. API Bundles:</strong> View live prices from RGC provider</p>
          <p><strong>2. Import:</strong> Select bundles and click "Import" to save them to your database</p>
          <p><strong>4. Saved Bundles:</strong> Edit your selling prices (App Price) and toggle active status</p>
          <p><strong>5. Profit:</strong> Difference between your App Price and API Price</p>
          <p><strong>6. Refresh:</strong> Click "Refresh API" to get latest prices from providers</p>
        </CardContent>
      </Card>
    </div>
  );
}
