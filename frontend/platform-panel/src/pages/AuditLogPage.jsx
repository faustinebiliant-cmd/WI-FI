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
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Audit Logs</h1>
          <p>Recent actions taken by Platform Admins (EAT).</p>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading logs..." />
        ) : logs.length === 0 ? (
          <div className="table-empty">No audit logs yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time (EAT)</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="cell-muted">
                    {log.created_at_eat}
                  </td>
                  <td>{log.admin_email}</td>
                  <td className="cell-strong">{log.action}</td>
                  <td className="col-wrap">
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