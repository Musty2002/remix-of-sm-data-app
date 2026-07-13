import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUserAccount } from '../_shared/validate-account.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BONANZA_BASE_URL = 'https://bonanzasubapi.com/api';

function cleanSecret(v: string | undefined | null) {
  return (v || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

// Network id mapping used by Bonanza (typical Nigerian VTU aggregator convention)
// 1=MTN, 2=GLO, 3=9MOBILE, 4=AIRTEL
function getNetworkId(name: string): number {
  const n = (name || '').toString().trim().toUpperCase();
  const map: Record<string, number> = {
    'MTN': 1, 'GLO': 2, '9MOBILE': 3, 'ETISALAT': 3, 'AIRTEL': 4,
    '1': 1, '2': 2, '3': 3, '4': 4,
  };
  const id = map[n];
  if (!id) throw new Error(`Unsupported network: ${name}`);
  return id;
}

async function bonanzaRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: object) {
  const token = cleanSecret(Deno.env.get('BONANZASUB_API_TOKEN'));
  if (!token) throw new Error('Bonanza service unavailable: token not configured');

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && method === 'POST') options.body = JSON.stringify(body);

  console.log(`Bonanza ${method} ${path}`, body ? JSON.stringify(body) : '');
  const res = await fetch(`${BONANZA_BASE_URL}${path}`, options);
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  console.log(`Bonanza status ${res.status}`, JSON.stringify(data));

  if (!res.ok || data?.Status === 'failed' || data?.status === 'failed' || data?.success === false) {
    const msg = data?.message || data?.api_response || data?.detail || `Bonanza request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

async function recordTransaction(
  supabase: any, userId: string, amount: number, category: string,
  description: string, status: 'completed' | 'pending' | 'failed',
  reference?: string, metadata?: object,
) {
  const { error } = await supabase.from('transactions').insert({
    user_id: userId, amount, type: 'debit', category, description,
    status, reference, metadata,
  });
  if (error) console.error('record tx err', error);
}

async function deductFromWallet(supabase: any, userId: string, amount: number) {
  const { data, error } = await supabase.rpc('deduct_wallet_balance', {
    _user_id: userId, _amount: amount,
  });
  if (error) { console.error(error); return false; }
  return data === true;
}

async function refundWallet(supabase: any, userId: string, amount: number) {
  const { data: w } = await supabase.from('wallets').select('balance').eq('user_id', userId).single();
  if (w) {
    await supabase.from('wallets').update({
      balance: Number(w.balance) + Number(amount), updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const auth = req.headers.get('authorization');
    let userId: string | null = null;
    if (auth) {
      const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
      if (user) userId = user.id;
    }

    const body = await req.json();
    const { action, serviceType } = body || {};

    // Public: fetch balance/user info (used by admin to test connectivity)
    if (action === 'get-user') {
      const data = await bonanzaRequest('/user/');
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Public: fetch data plans list (endpoint convention on Bonanza-style APIs)
    if (action === 'get-services' && serviceType === 'data') {
      try {
        const data = await bonanzaRequest('/user/');
        // Bonanza's user endpoint typically returns a MOBILE_NETWORK / Dataplans block
        const plans: any[] = [];
        const networks = data?.Dataplans || {};
        const pushPlan = (netKey: string, p: any) => {
          if (!p || (!p.dataplan_id && !p.id)) return;
          plans.push({
            id: Number(p.dataplan_id || p.id),
            product_id: Number(p.dataplan_id || p.id),
            service: p.plan_type || 'DATA',
            amount: String(p.plan_amount || p.amount || ''),
            name: [p.plan, p.month_validate].filter(Boolean).join(' - '),
            plan_size: p.plan,
            validity: p.month_validate,
            category: `${(p.plan_network || netKey || '').toUpperCase().replace('_PLAN','')} ${p.plan_type || ''}`.trim(),
            available: true,
            provider: 'bonanza',
          });
        };
        // Structure: Dataplans.MTN_PLAN.{CORPORATE|SME|GIFTING}[]
        Object.entries(networks).forEach(([netKey, group]: [string, any]) => {
          if (Array.isArray(group)) {
            group.forEach((p: any) => pushPlan(netKey, p));
          } else if (group && typeof group === 'object') {
            Object.values(group).forEach((arr: any) => {
              if (Array.isArray(arr)) arr.forEach((p: any) => pushPlan(netKey, p));
            });
          }
        });
        return new Response(JSON.stringify({ success: true, data: plans, raw: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, message: e.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action !== 'purchase') {
      return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ success: false, message: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const av = await validateUserAccount(supabase, userId);
    if (!av.valid) {
      return new Response(JSON.stringify({ success: false, message: av.error }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) {
      return new Response(JSON.stringify({
        success: false,
        message: `Please wait ${rl.retryAfter} seconds before making another purchase`,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let amount = 0;
    let description = '';
    let result: any;

    try {
      if (serviceType === 'data') {
        if (!body.plan || !body.mobile_number || !body.amount) {
          throw new Error('Missing required fields for data purchase');
        }
        amount = Number(body.amount);
        description = `Data purchase - ${body.mobile_number}`;

        if (!(await deductFromWallet(supabase, userId, amount))) {
          return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const networkId = getNetworkId(body.network || body.network_name || '');
        result = await bonanzaRequest('/data/', 'POST', {
          network: networkId,
          mobile_number: body.mobile_number,
          plan: Number(body.plan),
          Ported_number: true,
        });

        const success = result?.Status?.toString().toLowerCase() === 'successful' ||
                        result?.status?.toString().toLowerCase() === 'successful' ||
                        result?.Status === 'success' || result?.success === true;
        const status = success ? 'completed' : 'pending';

        await recordTransaction(supabase, userId, amount, 'data', description, status,
          result?.id?.toString() || result?.reference,
          { mobile_number: body.mobile_number, plan: body.plan, plan_name: body.plan_name,
            provider: 'bonanza', api_response: result });

      } else if (serviceType === 'airtime') {
        if (!body.amount || !body.mobile_number || !body.network) {
          throw new Error('Missing required fields for airtime purchase');
        }
        amount = Number(body.amount);
        description = `Airtime purchase - ${body.mobile_number}`;

        if (!(await deductFromWallet(supabase, userId, amount))) {
          return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const networkId = getNetworkId(body.network);
        result = await bonanzaRequest('/airtime/', 'POST', {
          network: networkId,
          amount: String(amount),
          mobile_number: body.mobile_number,
          Ported_number: true,
          airtime_type: 'VTU',
        });

        const success = result?.Status?.toString().toLowerCase() === 'successful' ||
                        result?.status?.toString().toLowerCase() === 'successful' ||
                        result?.success === true;
        const status = success ? 'completed' : 'pending';

        await recordTransaction(supabase, userId, amount, 'airtime', description, status,
          result?.id?.toString() || result?.reference,
          { mobile_number: body.mobile_number, network: body.network,
            provider: 'bonanza', api_response: result });

      } else {
        throw new Error('Unsupported service type');
      }

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('Bonanza purchase error', err);
      if (amount > 0) {
        await recordTransaction(supabase, userId, amount, serviceType, description, 'failed',
          undefined, { error: err.message, provider: 'bonanza' });
        await refundWallet(supabase, userId, amount);
      }
      return new Response(JSON.stringify({ success: false, message: err.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e: any) {
    console.error('bonanza-services error', e);
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
