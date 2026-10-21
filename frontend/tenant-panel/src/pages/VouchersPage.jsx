import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [generatedCodes, setGeneratedCodes] = useState(null);
  const [todayOnly, setTodayOnly] = useState(false);

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
    apiClient.get('/tenant/packages').then(res => {
      setPackages(res.data.data);
      if (res.data.data.length > 0) setSelectedPackage(res.data.data[0].id);
    });
    fetchVouchers(1);
  }, [fetchVouchers]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/tenant/vouchers/generate', { package_id: selectedPackage, quantity });
      setGeneratedCodes(res.data.data);
      fetchVouchers(1);
    } catch (error) {
      alert('Failed to generate vouchers');
    }
  };

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
            onClick={() => { setShowModal(true); setGeneratedCodes(null); }} 
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
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Package</th>
                <th style={{ padding: '12px 20px', color: '#6b7280', whiteSpace: 'nowrap' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '16px 20px', fontFamily: 'monospace', fontSize: '16px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{v.code}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>{v.packages?.name}</td>
                  <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                    <span className={`badge ${v.status === 'unused' ? 'badge-success' : 'badge-warning'}`}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination - now sits perfectly below the table and scrolls with it */}
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
            {!generatedCodes ? (
              <form onSubmit={handleGenerate}>
                <div className="form-group">
                  <label>Package</label>
                  <select className="form-control" required value={selectedPackage} onChange={e => setSelectedPackage(e.target.value)}>
                    {packages.map(p => <option key={p.id} value={p.id}>{p.name} - TZS {p.price_tzs}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input className="form-control" required type="number" min="1" max="500" value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" className="btn btn-primary">Generate</button>
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