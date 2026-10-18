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
      <div className="page-header">
        <div>
          <h1>Vouchers</h1>
          <p>Generate codes to sell to your guests.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--gray)' }}>
            <input type="checkbox" checked={todayOnly} onChange={(e) => { setTodayOnly(e.target.checked); }} />
            Today only (EAT)
          </label>
          <button onClick={() => { setShowModal(true); setGeneratedCodes(null); }} className="btn btn-primary">
            + Generate Vouchers
          </button>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <Loader message="Loading vouchers..." />
        ) : vouchers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            {todayOnly ? 'No vouchers generated today (EAT).' : 'No vouchers generated yet.'}
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Package</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 'bold' }}>{v.code}</td>
                    <td>{v.packages?.name}</td>
                    <td>
                      <span className={`badge ${v.status === 'unused' ? 'badge-success' : 'badge-warning'}`}>
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" disabled={page === 1} onClick={() => fetchVouchers(page - 1)}>Previous</button>
              <span style={{ fontSize: '14px', color: 'var(--gray)' }}>Page {page} of {totalPages}</span>
              <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => fetchVouchers(page + 1)}>Next</button>
            </div>
          </>
        )}
      </div>

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