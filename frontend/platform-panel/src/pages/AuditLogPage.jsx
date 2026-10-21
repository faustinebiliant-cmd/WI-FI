import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/platform/audit-logs')
      .then(res => setLogs(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>Audit Logs</h1>
        <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Recent actions taken by Platform Admins (EAT).</p>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <Loader message="Loading logs..." />
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No audit logs yet.</div>
        ) : (
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Time (EAT)</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Admin</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Action</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {log.created_at_eat}
                  </td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{log.admin_email}</td>
                  <td style={{ padding: '16px 20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{log.action}</td>
                  <td style={{ padding: '16px 20px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {log.target_label ? `Target: ${log.target_label}` : ''}
                    {log.details?.reason ? ` - Reason: ${log.details.reason}` : ''}
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