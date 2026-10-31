import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import ConfirmDialog from '../shared/components/ConfirmDialog';

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    try {
      // Note: The endpoint differs depending on if it's tenant or platform, 
      // but the table layout is the same.
      const res = await apiClient.get(window.location.pathname.includes('platform') ? '/platform/sessions' : '/tenant/sessions/active');
      setSessions(res.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const confirmDisconnect = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const endpoint = window.location.pathname.includes('platform') 
        ? `/platform/sessions/${deleteTarget.id}/disconnect` 
        : `/tenant/sessions/${deleteTarget.id}/disconnect`;
      
      await apiClient.post(endpoint);
      setDeleteTarget(null);
      fetchSessions();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to disconnect customer');
    } finally {
      setIsDeleting(false);
    }
  };

  const isPlatform = window.location.pathname.includes('platform');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>Active Sessions</h1>
        <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Customers currently connected{isPlatform ? ' across all routers' : ' to your WiFi'}.</p>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <Loader message="Loading sessions..." />
        ) : sessions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No active sessions right now.</div>
        ) : (
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                {isPlatform && <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Tenant</th>}
                {!isPlatform && <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Voucher Code</th>}
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Router</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>MAC Address</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Started (EAT)</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {isPlatform ? (
                    <td style={{ padding: '16px 20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{s.tenants?.business_name}</td>
                  ) : (
                    <td style={{ padding: '16px 20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{s.vouchers?.code}</td>
                  )}
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{s.routers?.name}</td>
                  <td style={{ padding: '16px 20px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.mac_address}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{s.started_at_eat}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setDeleteTarget(s)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Disconnect Customer"
        message={`Are you sure you want to kick ${deleteTarget?.mac_address} off the WiFi?`}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeleting}
        onConfirm={confirmDisconnect}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}