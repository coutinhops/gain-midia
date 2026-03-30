'use client';

import Header from '@/components/Header';
import PeriodFilter from '@/components/PeriodFilter';
import MetricCard from '@/components/MetricCard';
import ErrorCard from '@/components/ErrorCard';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [openAIKey, setOpenAIKey] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [gadsAuth, setGadsAuth] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/user-config')
      .then(res => res.json())
      .then(data => {
        setOpenAIKey(data.openAIKey || '');
        setMetaAccessToken(data.metaAccessToken || '');
        setGadsAuth(data.gadsAccounts && data.gadsAccounts.length > 0);
      })
      .catch(err => setError('Failed to load config'));
  }, []);

  return (
    <div className="space-y-6">
      <PeriodFilter />
      {error && <ErrorCard title="Error" message={error} />}
      <div className="grid grid-cols-1/md:2 gap-4">
        <MetricCard title="Total Contas" label="0" />
        <MetricCard title="Campanhas" label="0" />
        <MetricCard title="Meta Connected" label={metaAccessToken ? "✓" : "⟘" } />
        <MetricCard title="Google Ads Connected" label={gadsAuth ? "⟃" : "⟘" } />
        <MetricCard title="OpenAI Connected" label={openAIKey ? "⟃" : "⟘" } />
      </div>
    </div>
  );
}
