import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function RoutersPage() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    location_label: '',
    ip_address: '',
    api_username: '',
    api_password: ''
  });

  useEffect(() => { fetchRouters(); }, []);

  const fetchRouters = async () => {
    try {
      const res = await apiClient.get('/tenant/routers');
      setRouters(res.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/tenant/routers', formData);
      setShowModal(false);
      setFormData({ name: '', location_label: '', ip_address: '', api_username: '', api_password: '' });
      fetchRouters();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create router');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Routers</h1>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Manage your MikroTik hardware.</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', width: '100%', maxWidth: '200px' }}>
          + Add Router
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <Loader message="Loading routers..." />
        ) : routers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No routers found. Add one to start selling WiFi.</div>
        ) : (
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Name</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Location</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Portal URL</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => {
                const portalUrl = `${import.meta.env.VITE_PORTAL_BASE}/?router=${router.router_token}&mac=11:22:33:44:55:66`;
                // Clean the status string so minor DB typos don't break colors
                const statusText = (router.status || 'offline').trim().toLowerCase();
                const isOnline = statusText === 'online';

                return (
                  <tr key={router.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{router.name}</td>
                    <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{router.location_label || '-'}</td>
                    <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                      <span style={{ 
                        padding: '4px 10px', 
                        borderRadius: '50px', 
                        fontSize: '12px', 
                        fontWeight: 'bold', 
                        backgroundColor: isOnline ? '#ecfdf5' : '#fef2f2', 
                        color: isOnline ? '#059669' : '#dc2626' 
                      }}>
                        {statusText.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                      <a href={portalUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                        Test Portal Link
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0 }}>Add New Router</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input required type="text" placeholder="Router Name (e.g. Main Lobby)" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '10px' }} />
              <input type="text" placeholder="Location (e.g. Reception)" value={formData.location_label} onChange={e => setFormData({...formData, location_label: e.target.value})} style={{ padding: '10px' }} />
              <input required type="text" placeholder="IP Address (e.g. 192.168.88.1)" value={formData.ip_address} onChange={e => setFormData({...formData, ip_address: e.target.value})} style={{ padding: '10px' }} />
              <input required type="text" placeholder="API Username" value={formData.api_username} onChange={e => setFormData({...formData, api_username: e.target.value})} style={{ padding: '10px' }} />
              <input required type="password" placeholder="API Password" value={formData.api_password} onChange={e => setFormData({...formData, api_password: e.target.value})} style={{ padding: '10px' }} />
              
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Save Router</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}