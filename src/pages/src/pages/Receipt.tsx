import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Transaction } from '@/types/database';
import { TransactionReceipt } from '@/components/TransactionReceipt';
import { TransactionMetadata } from '@/lib/transactionStatus';

export default function Receipt() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!transactionId) return;

    const fetchTransaction = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (data) {
        setTransaction(data as Transaction);
      }
      setLoading(false);
    };

    fetchTransaction();
  }, [transactionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-primary">Loading receipt...</div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-600 text-center">Transaction not found.</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const metadata = transaction.metadata as any;
  const receiptTransaction = {
    id: transaction.reference || transaction.id,
    date: new Date(transaction.created_at),
    phoneNumber: metadata?.phone_number || metadata?.mobile_number || 'N/A',
    network: metadata?.network || transaction.category.toUpperCase(),
    amount: transaction.amount,
    type: (transaction.category === 'data' ? 'data' : 'airtime') as 'airtime' | 'data',
    dataPlan: metadata?.plan_name || metadata?.data_plan || undefined,
    status: transaction.status,
    metadata: transaction.metadata,
  };

  return (
    <TransactionReceipt
      open={true}
      onClose={() => navigate(-1)}
      transaction={receiptTransaction}
    />
  );
}
