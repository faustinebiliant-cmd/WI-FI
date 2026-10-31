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
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>All Routers</h1>
          <p>Read-only view of every router across all businesses.</p>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading routers..." />
        ) : routers.length === 0 ? (
          <div className="table-empty">No routers registered yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Router Name</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => (
                <tr key={router.id}>
                  <td className="cell-strong">{router.tenants?.business_name || 'Unknown'}</td>
                  <td>{router.name}</td>
                  <td>{router.location_label || '-'}</td>
                  <td>
                    <span className={`badge ${router.status === 'online' ? 'badge-success' : 'badge-danger'}`}>
                      {router.status}
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