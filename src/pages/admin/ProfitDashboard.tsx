import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  Wallet,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Calendar,
  Wifi,
  Phone,
  Zap,
  Tv,
  GraduationCap,
  Package,
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';
import { toast } from 'sonner';

type Preset = 'today' | 'week' | 'month' | 'all' | 'custom';

interface Txn {
  id: string;
  category: string;
  amount: number;
  status: string;
  metadata: any;
  created_at: string;
  description: string;
}

// Default margins used when no explicit API cost is available in metadata.
// These are only fallbacks — data cost is looked up from data_bundles.
const DEFAULT_MARGIN: Record<string, number> = {
  airtime: 0.02,
  electricity: 0.01,
  tv: 0.01,
  exam_pin: 0.05,
};

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  data: { label: 'Data', icon: Wifi, color: 'bg-blue-500' },
  airtime: { label: 'Airtime', icon: Phone, color: 'bg-green-500' },
  electricity: { label: 'Electricity', icon: Zap, color: 'bg-yellow-500' },
  tv: { label: 'TV Subscription', icon: Tv, color: 'bg-purple-500' },
  exam_pin: { label: 'Exam PIN', icon: GraduationCap, color: 'bg-pink-500' },
};

const PROFIT_CATEGORIES = ['data', 'airtime', 'electricity', 'tv', 'exam_pin'] as const;
// Categories that actually exist in the DB enum (exam_pin isn't in the enum yet).
const QUERYABLE_CATEGORIES = ['data', 'airtime', 'electricity', 'tv'] as const satisfies readonly (
  'data' | 'airtime' | 'electricity' | 'tv'
)[];

const money = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n || 0);

function extractApiCost(t: Txn, bundleMap: Map<string, number>): number {
  const md = t.metadata || {};
  // 1. Explicit fields written by newer edge functions
  const explicit =
    md.api_cost ?? md.buying_amount ?? md.buyingAmount ?? md?.api_response?.data?.buyingAmount;
  if (explicit !== undefined && explicit !== null && !isNaN(Number(explicit))) {
    return Number(explicit);
  }

  // 2. Data bundle lookup by plan code
  if (t.category === 'data') {
    const planCode =
      md.plan_code ?? md.plan ?? md.plan_id ?? md.planId ?? md?.api_request?.plan;
    if (planCode !== undefined && planCode !== null) {
      const key = String(planCode);
      if (bundleMap.has(key)) return bundleMap.get(key)!;
    }
  }

  // 3. Fallback margin
  const margin = DEFAULT_MARGIN[t.category] ?? 0;
  return Number(t.amount) * (1 - margin);
}

export default function ProfitDashboard() {
  const [preset, setPreset] = useState<Preset>('today');
  const [customStart, setCustomStart] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [txns, setTxns] = useState<Txn[]>([]);
  const [bundleMap, setBundleMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [allTimeStats, setAllTimeStats] = useState({ profit: 0, sales: 0 });

  const range = useMemo(() => {
    const now = new Date();
    if (preset === 'today') return { from: startOfDay(now), to: endOfDay(now) };
    if (preset === 'week')
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    if (preset === 'month') return { from: startOfMonth(now), to: endOfDay(now) };
    if (preset === 'custom')
      return { from: startOfDay(new Date(customStart)), to: endOfDay(new Date(customEnd)) };
    return { from: new Date(2020, 0, 1), to: endOfDay(now) }; // all
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('data_bundles')
        .select('plan_code, api_price');
      const map = new Map<string, number>();
      (data || []).forEach((b: any) => map.set(String(b.plan_code), Number(b.api_price)));
      setBundleMap(map);
    })();
  }, []);

  useEffect(() => {
    fetchTxns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()]);

  useEffect(() => {
    // Fetch all-time completed profit summary once bundles are loaded
    if (bundleMap.size === 0) return;
    (async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, category, amount, status, metadata, created_at, description')
        .eq('status', 'completed')
        .in('category', [...QUERYABLE_CATEGORIES]);
      const rows = (data as Txn[]) || [];
      const totalProfit = rows.reduce(
        (s, t) => s + (Number(t.amount) - extractApiCost(t, bundleMap)),
        0,
      );
      const totalSales = rows.reduce((s, t) => s + Number(t.amount), 0);
      setAllTimeStats({ profit: totalProfit, sales: totalSales });
    })();
  }, [bundleMap]);

  const fetchTxns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, category, amount, status, metadata, created_at, description')
        .gte('created_at', range.from.toISOString())
        .lte('created_at', range.to.toISOString())
        .in('category', [...QUERYABLE_CATEGORIES])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTxns((data as Txn[]) || []);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const completed = txns.filter((t) => t.status === 'completed');
    const failed = txns.filter((t) => t.status === 'failed');
    const sales = completed.reduce((s, t) => s + Number(t.amount), 0);
    const profit = completed.reduce(
      (s, t) => s + (Number(t.amount) - extractApiCost(t, bundleMap)),
      0,
    );

    const byCategory: Record<string, { sales: number; profit: number; count: number }> = {};
    for (const cat of PROFIT_CATEGORIES) {
      byCategory[cat] = { sales: 0, profit: 0, count: 0 };
    }
    for (const t of completed) {
      const cat = t.category;
      if (!byCategory[cat]) byCategory[cat] = { sales: 0, profit: 0, count: 0 };
      const cost = extractApiCost(t, bundleMap);
      byCategory[cat].sales += Number(t.amount);
      byCategory[cat].profit += Number(t.amount) - cost;
      byCategory[cat].count += 1;
    }

    return {
      sales,
      profit,
      successful: completed.length,
      failed: failed.length,
      byCategory,
    };
  }, [txns, bundleMap]);

  const exportCSV = () => {
    const rows = [
      ['Date', 'Category', 'Description', 'Status', 'Sale (₦)', 'API Cost (₦)', 'Profit (₦)'],
      ...txns.map((t) => {
        const cost = t.status === 'completed' ? extractApiCost(t, bundleMap) : 0;
        const profit = t.status === 'completed' ? Number(t.amount) - cost : 0;
        return [
          format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
          t.category,
          (t.description || '').replace(/[\r\n,]+/g, ' '),
          t.status,
          Number(t.amount).toFixed(2),
          cost.toFixed(2),
          profit.toFixed(2),
        ];
      }),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-report-${format(range.from, 'yyyyMMdd')}-${format(range.to, 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const exportPDF = () => {
    // Lightweight printable HTML → user prints/saves as PDF
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = txns
      .map((t) => {
        const cost = t.status === 'completed' ? extractApiCost(t, bundleMap) : 0;
        const profit = t.status === 'completed' ? Number(t.amount) - cost : 0;
        return `<tr>
          <td>${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}</td>
          <td>${t.category}</td>
          <td>${t.status}</td>
          <td style="text-align:right">${money(Number(t.amount))}</td>
          <td style="text-align:right">${money(cost)}</td>
          <td style="text-align:right;color:${profit >= 0 ? '#059669' : '#dc2626'}">${money(profit)}</td>
        </tr>`;
      })
      .join('');
    win.document.write(`
      <html><head><title>Profit Report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{margin:0 0 4px}
        .muted{color:#666;font-size:12px;margin-bottom:16px}
        .kpis{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
        .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;min-width:150px}
        .kpi .label{font-size:11px;color:#6b7280;text-transform:uppercase}
        .kpi .value{font-size:20px;font-weight:700;margin-top:4px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid #e5e7eb;padding:6px 8px;text-align:left}
        th{background:#f9fafb}
      </style></head><body>
      <h1>SM Data Sub — Profit Report</h1>
      <div class="muted">${format(range.from, 'PP')} – ${format(range.to, 'PP')}</div>
      <div class="kpis">
        <div class="kpi"><div class="label">Total Profit</div><div class="value">${money(stats.profit)}</div></div>
        <div class="kpi"><div class="label">Total Sales</div><div class="value">${money(stats.sales)}</div></div>
        <div class="kpi"><div class="label">Successful</div><div class="value">${stats.successful}</div></div>
        <div class="kpi"><div class="label">Failed</div><div class="value">${stats.failed}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Category</th><th>Status</th>
          <th style="text-align:right">Sale</th>
          <th style="text-align:right">API Cost</th>
          <th style="text-align:right">Profit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    win.document.close();
  };

  const rangeLabel =
    preset === 'today'
      ? "Today"
      : preset === 'week'
      ? 'This Week'
      : preset === 'month'
      ? 'This Month'
      : preset === 'all'
      ? 'All Time'
      : `${format(range.from, 'PP')} – ${format(range.to, 'PP')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit Dashboard</h1>
          <p className="text-gray-500">
            Monitor sales, profit and performance across services.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={txns.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={exportPDF} disabled={txns.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Date Range</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {preset === 'custom' && (
              <>
                <div>
                  <Label className="mb-2 block">From</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">To</Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {rangeLabel}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title={`Profit — ${rangeLabel}`}
          value={money(stats.profit)}
          icon={TrendingUp}
          color="bg-green-500"
          loading={loading}
        />
        <KpiCard
          title={`Sales — ${rangeLabel}`}
          value={money(stats.sales)}
          icon={Wallet}
          color="bg-blue-500"
          loading={loading}
        />
        <KpiCard
          title="Successful Transactions"
          value={stats.successful.toLocaleString()}
          icon={CheckCircle2}
          color="bg-emerald-500"
          loading={loading}
        />
        <KpiCard
          title="Failed Transactions"
          value={stats.failed.toLocaleString()}
          icon={XCircle}
          color="bg-red-500"
          loading={loading}
        />
      </div>

      {/* All-time / Aggregate strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiCard
          title="Total Profit — All Time"
          value={money(allTimeStats.profit)}
          icon={TrendingUp}
          color="bg-purple-500"
        />
        <KpiCard
          title="Total Sales — All Time"
          value={money(allTimeStats.sales)}
          icon={Package}
          color="bg-orange-500"
        />
      </div>

      {/* Category breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profit Breakdown by Service</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Sales (₦)</TableHead>
                  <TableHead className="text-right">Profit (₦)</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROFIT_CATEGORIES.map((cat) => {
                  const meta = CATEGORY_META[cat] || { label: cat, icon: Package, color: 'bg-gray-500' };
                  const Icon = meta.icon;
                  const row = stats.byCategory[cat] || { sales: 0, profit: 0, count: 0 };
                  const margin = row.sales > 0 ? (row.profit / row.sales) * 100 : 0;
                  return (
                    <TableRow key={cat}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`${meta.color} p-1.5 rounded-md text-white`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="font-medium">{meta.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{money(row.sales)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {money(row.profit)}
                      </TableCell>
                      <TableCell className="text-right text-gray-500">
                        {margin.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Data profit is calculated from imported bundle API prices. For airtime, electricity, TV
            and exam PIN, default margins ({Object.entries(DEFAULT_MARGIN)
              .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
              .join(', ')}) are used unless the transaction stored its API cost.
          </p>
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transactions ({txns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : txns.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No transactions in this range.</p>
          ) : (
            <div className="overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txns.slice(0, 200).map((t) => {
                    const cost = t.status === 'completed' ? extractApiCost(t, bundleMap) : 0;
                    const profit = t.status === 'completed' ? Number(t.amount) - cost : 0;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">
                          {format(new Date(t.created_at), 'MMM dd, HH:mm')}
                        </TableCell>
                        <TableCell className="capitalize">{t.category}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs text-gray-600">
                          {t.description}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              t.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : t.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {t.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{money(Number(t.amount))}</TableCell>
                        <TableCell className="text-right text-gray-500">{money(cost)}</TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {money(profit)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {txns.length > 200 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing latest 200 of {txns.length}. Export CSV/PDF for full list.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  icon: any;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 truncate">{title}</p>
            <p className="text-2xl font-bold mt-1 truncate">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : value}
            </p>
          </div>
          <div className={`${color} p-3 rounded-xl flex-shrink-0`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
