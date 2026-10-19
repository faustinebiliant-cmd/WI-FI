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

  const fetchSessions = () => {
    apiClient.get('/platform/sessions')
      .then(res => setSessions(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  const confirmDisconnect = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.post(`/platform/sessions/${deleteTarget.id}/disconnect`);
      setDeleteTarget(null);
      fetchSessions();
    } catch (error) {
      alert('Failed to disconnect guest');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>Active Sessions</h1>
        <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Guests currently connected across all routers.</p>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {loading ? (
          <Loader message="Loading sessions..." />
        ) : sessions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No active sessions right now.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Tenant</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Router</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>MAC Address</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Started (EAT)</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontWeight: 'bold' }}>{session.tenants?.business_name || 'Unknown'}</td>
                  <td style={{ padding: '16px 20px' }}>{session.routers?.name || 'Unknown'}</td>
                  <td style={{ padding: '16px 20px', fontFamily: 'monospace' }}>{session.mac_address}</td>
                  <td style={{ padding: '16px 20px' }}>{session.started_at_eat}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <button onClick={() => setDeleteTarget(session)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
        title="Force Disconnect Guest"
        message={`Are you sure you want to disconnect ${deleteTarget?.mac_address}? They will be kicked off the network immediately.`}
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