import React from "react";
import { useParams } from "react-router-dom";

const Receipt: React.FC = () => {
  const { transactionId } = useParams<{ transactionId?: string }>();

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">Receipt</h1>
      <p className="mt-2">Transaction ID: {transactionId ?? "—"}</p>
      <p className="mt-4 text-sm text-muted-foreground">This is a placeholder receipt page. Replace with your actual receipt UI.</p>
    </div>
  );
};

export default Receipt;
