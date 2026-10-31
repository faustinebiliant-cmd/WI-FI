import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import { FiUsers, FiTag, FiWifi, FiCheckCircle, FiClock } from 'react-icons/fi';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/tenant/dashboard')
      .then(res => setStats(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader message="Loading dashboard..." />;
  if (!stats) return <div>Failed to load stats.</div>;

  const StatCard = ({ title, value, icon: Icon, color, bg }) => (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: bg, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={24} />
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--dark)', lineHeight: '1.2' }}>{value}</div>
        <div style={{ fontSize: '13px', color: 'var(--gray)', fontWeight: '500' }}>{title}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            Welcome back. Here is what is happening on your network
            {stats.todayEAT ? ` (today: ${stats.todayEAT}, EAT)` : ''}.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <StatCard title="Active Customers Online" value={stats.activeCustomers} icon={FiUsers} color="var(--primary)" bg="var(--primary-soft)" />
        <StatCard title="Vouchers Used Today" value={stats.vouchersUsedToday} icon={FiClock} color="var(--info)" bg="#eff6ff" />
        <StatCard title="Vouchers Used (total)" value={stats.totalVouchers - stats.unusedVouchers} icon={FiCheckCircle} color="var(--success)" bg="var(--success-soft)" />
        <StatCard title="Unused Vouchers" value={stats.unusedVouchers} icon={FiTag} color="var(--warning)" bg="var(--warning-soft)" />
        <StatCard title="Total Routers" value={stats.totalRouters} icon={FiWifi} color="var(--gray)" bg="var(--light)" />
      </div>
    </div>
  );
}