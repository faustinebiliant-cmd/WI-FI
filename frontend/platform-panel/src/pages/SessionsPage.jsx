import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import { useToast } from '../shared/components/Toast';

export default function SessionsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [disconnectError, setDisconnectError] = useState('');

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
    setDisconnectError('');
    try {
      const endpoint = window.location.pathname.includes('platform') 
        ? `/platform/sessions/${deleteTarget.id}/disconnect` 
        : `/tenant/sessions/${deleteTarget.id}/disconnect`;
      
      await apiClient.post(endpoint);
      setDeleteTarget(null);
      toast('Customer disconnected');
      fetchSessions();
    } catch (error) {
      setDisconnectError(error.response?.data?.error || 'Failed to disconnect customer.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isPlatform = window.location.pathname.includes('platform');

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Active Sessions</h1>
          <p>Customers currently connected{isPlatform ? ' across all routers' : ' to your WiFi'}.</p>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading sessions..." />
        ) : sessions.length === 0 ? (
          <div className="table-empty">No active sessions right now.</div>
        ) : (
          <table>
            <thead>
              <tr>
                {isPlatform && <th>Business</th>}
                {!isPlatform && <th>Voucher Code</th>}
                <th>Router</th>
                <th>MAC Address</th>
                <th>Started (EAT)</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  {isPlatform ? (
                    <td className="cell-strong">{s.tenants?.business_name}</td>
                  ) : (
                    <td className="cell-strong">{s.vouchers?.code}</td>
                  )}
                  <td>{s.routers?.name}</td>
                  <td className="cell-mono">{s.mac_address}</td>
                  <td>{s.started_at_eat}</td>
                  <td className="col-actions">
                    <button onClick={() => setDeleteTarget(s)} className="btn btn-sm btn-danger">
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
        message={disconnectError || `Are you sure you want to kick ${deleteTarget?.mac_address} off the WiFi?`}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeleting}
        onConfirm={confirmDisconnect}
        onCancel={() => { setDeleteTarget(null); setDisconnectError(''); }}
      />
    </div>
  );
}