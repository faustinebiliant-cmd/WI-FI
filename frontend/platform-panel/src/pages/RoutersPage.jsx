import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function RoutersPage() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/platform/routers')
      .then(res => setRouters(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>All Routers</h1>
        <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Read-only view of every router across all tenants.</p>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {loading ? (
          <Loader message="Loading routers..." />
        ) : routers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No routers registered yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Tenant</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Router Name</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Location</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => (
                <tr key={router.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontWeight: 'bold' }}>{router.tenants?.business_name || 'Unknown'}</td>
                  <td style={{ padding: '16px 20px' }}>{router.name}</td>
                  <td style={{ padding: '16px 20px' }}>{router.location_label || '-'}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '50px', fontSize: '12px', fontWeight: 'bold', backgroundColor: router.status === 'online' ? '#ecfdf5' : '#fef2f2', color: router.status === 'online' ? '#059669' : '#dc2626' }}>
                      {router.status.toUpperCase()}
                    </span>
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