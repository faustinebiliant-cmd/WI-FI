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
      const res = await apiClient.get('/tenant/sessions/active');
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
      await apiClient.post(`/tenant/sessions/${deleteTarget.id}/disconnect`);
      setDeleteTarget(null);
      toast('Customer disconnected');
      fetchSessions();
    } catch (error) {
      setDisconnectError(error.response?.data?.error || 'Failed to disconnect customer.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Active Sessions</h1>
          <p>Customers currently connected to your WiFi.</p>
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
                <th>Voucher Code</th>
                <th>Router</th>
                <th>MAC Address</th>
                <th>Started (EAT)</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong">{s.vouchers?.code}</td>
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
        confirmLabel={disconnectError ? 'Try Again' : 'Disconnect'}
        cancelLabel="Cancel"
        variant="danger"
        loading={isDeleting}
        onConfirm={confirmDisconnect}
        onCancel={() => { setDeleteTarget(null); setDisconnectError(''); }}
      />
    </div>
  );
}