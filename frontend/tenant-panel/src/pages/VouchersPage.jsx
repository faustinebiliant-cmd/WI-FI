import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [quantity, setQuantity] = useState(''); 
  const [generatedCodes, setGeneratedCodes] = useState(null);
  const [todayOnly, setTodayOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchVouchers = useCallback(async (pageNumber = 1) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(pageNumber), limit: '20' });
      if (todayOnly) qs.set('today', 'true');
      const res = await apiClient.get(`/tenant/vouchers?${qs.toString()}`);
      setVouchers(res.data.data);
      setTotalPages(res.data.pagination.pages);
      setPage(res.data.pagination.page);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [todayOnly]);

  useEffect(() => {
    Promise.all([
      apiClient.get('/tenant/packages'),
      apiClient.get('/tenant/routers')
    ]).then(([pkgRes, routerRes]) => {
      setPackages(pkgRes.data.data);
      setRouters(routerRes.data.data);
      if (pkgRes.data.data.length > 0) setSelectedPackage(pkgRes.data.data[0].id);
    });
    fetchVouchers(1);
  }, [fetchVouchers]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    
    const numQuantity = parseInt(quantity);
    if (!numQuantity || numQuantity < 1 || numQuantity > 50) {
      setErrorMsg('Please enter a number between 1 and 50.');
      return;
    }

    try {
      const res = await apiClient.post('/tenant/vouchers/generate', { package_id: selectedPackage, quantity: numQuantity });
      setGeneratedCodes(res.data.data);
      setQuantity('');
      fetchVouchers(1);
    } catch (error) {
      setErrorMsg(error.response?.data?.error || 'Failed to generate vouchers');
    }
  };

  // FIXED: Helper function to safely handle EAT time string
  const getRemainingTime = (expiresAt) => {
    if (!expiresAt) return null;
    
    // Format: "YYYY-MM-DD HH:MM" -> replace space with 'T' for JavaScript Date
    const safeDateString = expiresAt.replace(' ', 'T');
    const now = new Date();
    const expires = new Date(safeDateString);
    const diffMs = expires - now;
    
    if (diffMs <= 0) return 'Expired';
    
    const diffMins = Math.floor(diffMs / 60000);
    const days = Math.floor(diffMins / 1440);
    const hours = Math.floor((diffMins % 1440) / 60);
    const mins = diffMins % 60;

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  const hasMultipleRouters = routers.length > 1;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Vouchers</h1>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Generate codes to sell to your guests.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '300px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--gray)' }}>
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={(e) => { setTodayOnly(e.target.checked); }}
              style={{ width: '18px', height: '18px' }}
            />
            Today only (EAT)
          </label>
          <button
            onClick={() => { setShowModal(true); setGeneratedCodes(null); setErrorMsg(''); }}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            + Generate Vouchers
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <Loader message="Loading vouchers..." />
        ) : vouchers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            {todayOnly ? 'No vouchers generated today (EAT).' : 'No vouchers generated yet.'}
          </div>
        ) : (
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Code</th>
                {hasMultipleRouters && <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Router</th>}
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Package</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: '16px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{v.code}</td>
                  
                  {hasMultipleRouters && (
                    <td style={{ padding: '16px 20px', fontWeight: 'bold', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                      {v.packages?.router_name || 'Any'}
                    </td>
                  )}

                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{v.packages?.name}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className={`badge ${v.status === 'unused' ? 'badge-success' :
                          v.status === 'active' ? 'badge-warning' :
                            'badge-danger'
                        }`} style={{ width: 'fit-content' }}>
                        {v.status}
                      </span>
                      {v.status === 'active' && v.expires_at && (
                        <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>
                          {getRemainingTime(v.expires_at)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && vouchers.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', width: 'max-content', minWidth: '100%', gap: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '8px' }}>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => fetchVouchers(page - 1)}>
            Previous
          </button>
          <span style={{ fontSize: '14px', color: 'var(--gray)', whiteSpace: 'nowrap' }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => fetchVouchers(page + 1)}>
            Next
          </button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0 }}>Generate Vouchers</h2>
            
            {errorMsg && (
              <div style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-soft)', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
                {errorMsg}
              </div>
            )}

            {!generatedCodes ? (
              <form onSubmit={handleGenerate}>
                <div className="form-group">
                  <label>Package</label>
                  <select className="form-control" required value={selectedPackage} onChange={e => setSelectedPackage(e.target.value)}>
                    {packages.map(p => (
                      <option key={p.id} value={p.id}>
                        {hasMultipleRouters ? `${p.name} - TZS ${p.price_tzs} (${p.router_name || 'No Router'})` : `${p.name} - TZS ${p.price_tzs}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity (Max 50)</label>
                  <input 
                    className="form-control" 
                    required 
                    type="text" 
                    inputMode="numeric" 
                    pattern="[0-9]*" 
                    placeholder="e.g. 50" 
                    maxLength={2}
                    value={quantity} 
                    onChange={e => {
                      const val = e.target.value;
                      if (/^\d*$/.test(val)) {
                        setQuantity(val);
                      }
                    }} 
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={!quantity}>Generate</button>
                </div>
              </form>
            ) : (
              <div>
                <p style={{ color: 'var(--success)', fontWeight: 'bold' }}>Successfully generated {generatedCodes.length} vouchers!</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '20px', maxHeight: '300px', overflowY: 'auto', padding: '10px', backgroundColor: 'var(--light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  {generatedCodes.map((code, idx) => (
                    <div key={idx} style={{ fontFamily: 'monospace', fontSize: '16px', textAlign: 'center', padding: '5px', border: '1px dashed #ccc' }}>{code}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setShowModal(false)} className="btn btn-primary">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}