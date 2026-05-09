'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../supabase';
import BrokerSidebar from '../../../../components/BrokerSidebar';
import { getAccountType } from '../../../../lib/account';
import RFPWizard from '../../new/wizard';

export default function EditRFPPage() {
  const router = useRouter();
  const params = useParams();
  const rfpId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (getAccountType(user) !== 'broker') {
      router.push('/profile');
      return;
    }
    setUser(user);

    const { data: brokerData } = await supabase
      .from('brokers')
      .select('id, agency_id, agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (brokerData) {
      setBrokerId(brokerData.id);
      setAgencyId(brokerData.agency_id);
      if (brokerData.agencies) {
        setAgencyName((brokerData.agencies as any).name || 'Your Agency');
      }
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="rfps"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar
        active="rfps"
        firstName={user?.user_metadata?.first_name || ''}
        lastName={user?.user_metadata?.last_name || ''}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
        <RFPWizard
          startMode="from-spd"
          user={user}
          agencyId={agencyId}
          brokerId={brokerId}
          editingRfpId={rfpId}
          onCancel={() => router.push(`/broker/rfps/${rfpId}`)}
          onExit={() => router.push(`/broker/rfps/${rfpId}`)}
        />
      </div>
    </div>
  );
}