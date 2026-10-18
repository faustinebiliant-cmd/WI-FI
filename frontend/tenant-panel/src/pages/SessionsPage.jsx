import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.get('/tenant/sessions/active');
      setSessions(res.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (id) => {
    if (!window.confirm('Disconnect this guest from the WiFi?')) return;
    try {
      await apiClient.post(`/tenant/sessions/${id}/disconnect`);
      fetchSessions();
    } catch (error) {
      alert('Failed to disconnect guest');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>Active Sessions</h1>
        <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Guests currently connected to your WiFi.</p>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {loading ? (
          <Loader message="Loading sessions..." />
        ) : sessions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No active guests right now.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>MAC Address</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Voucher Code</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Router</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Started (EAT)</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontFamily: 'monospace' }}>{s.mac_address}</td>
                  <td style={{ padding: '16px 20px', fontWeight: 'bold' }}>{s.vouchers?.code}</td>
                  <td style={{ padding: '16px 20px' }}>{s.routers?.name}</td>
                  <td style={{ padding: '16px 20px' }}>{s.started_at_eat}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <button onClick={() => handleDisconnect(s.id)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}