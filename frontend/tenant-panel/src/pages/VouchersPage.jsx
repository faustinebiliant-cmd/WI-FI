import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { FiSearch } from 'react-icons/fi';
import Loader from '../shared/components/Loader';
import CopyButton from '../shared/components/CopyButton';
import { useToast } from '../shared/components/Toast';

const SEARCH_DELAY_MS = 350; // wait until the user stops typing before asking the server

export default function VouchersPage() {
  const toast = useToast();
  const [vouchers, setVouchers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [revokeTarget, setRevokeTarget] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  const fetchVouchers = useCallback(async (pageNumber = 1) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(pageNumber), limit: '20' });
      if (todayOnly) qs.set('today', 'true');
      if (search) qs.set('search', search);
      if (statusFilter) qs.set('status', statusFilter);
      const res = await apiClient.get(`/tenant/vouchers?${qs.toString()}`);
      setVouchers(res.data.data);
      setTotalPages(res.data.pagination.pages);
      setPage(res.data.pagination.page);
      setLoadError('');
    } catch (error) {
      console.error(error);
      setLoadError('Failed to load vouchers. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [todayOnly, search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const isFiltered = todayOnly || search || statusFilter;

  // Packages and routers: load once
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get('/tenant/packages'),
      apiClient.get('/tenant/routers')
    ])
      .then(([pkgRes, routerRes]) => {
        if (cancelled) return;
        setPackages(pkgRes.data.data);
        setRouters(routerRes.data.data);
        if (pkgRes.data.data.length > 0) setSelectedPackage(pkgRes.data.data[0].id);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError('Failed to load packages. Please refresh the page.');
      });
    return () => { cancelled = true; };
  }, []);

  // Voucher list: reload when the filter changes
  useEffect(() => {
    fetchVouchers(1);
  }, [fetchVouchers]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (isGenerating) return;
    setErrorMsg('');

    const numQuantity = parseInt(quantity, 10);
    if (!numQuantity || numQuantity < 1 || numQuantity > 50) {
      setErrorMsg('Please enter a number between 1 and 50.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await apiClient.post('/tenant/vouchers/generate', { package_id: selectedPackage, quantity: numQuantity });
      setGeneratedCodes(res.data.data);
      setQuantity('');
      fetchVouchers(1);
    } catch (error) {
      setErrorMsg(error.response?.data?.error || 'Failed to generate vouchers');
    } finally {
      setIsGenerating(false);
    }
  };

  const openRevoke = (voucher) => {
    setRevokeError('');
    setRevokeTarget(voucher);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    setRevokeError('');
    try {
      await apiClient.patch(`/tenant/vouchers/${revokeTarget.id}/revoke`);
      setRevokeTarget(null);
      toast(`Voucher ${revokeTarget.code} revoked`);
      fetchVouchers(page);
    } catch (error) {
      setRevokeError(error.response?.data?.error || 'Failed to revoke voucher');
    } finally {
      setIsRevoking(false);
    }
  };

  const getRemainingTime = (expiresAt) => {
    if (!expiresAt) return null;
    // The server sends the exact moment with its time zone, so this is right in any time zone
    const expires = new Date(expiresAt);
    if (isNaN(expires.getTime())) return null;
    const diffMs = expires - new Date();

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
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Vouchers</h1>
          <p>Generate codes to sell to your customers.</p>
        </div>

        <button
          onClick={() => { setShowModal(true); setGeneratedCodes(null); setErrorMsg(''); }}
          className="btn btn-primary"
        >
          + Generate Vouchers
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <FiSearch size={16} />
          <input
            className="form-control"
            type="search"
            placeholder="Search code"
            aria-label="Search voucher code"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32))}
          />
        </div>
        <select className="form-control" aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="unused">Unused</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Revoked</option>
        </select>
        <label className="check-label">
          <input
            type="checkbox"
            checked={todayOnly}
            onChange={(e) => { setTodayOnly(e.target.checked); }}
          />
          Today only (EAT)
        </label>
      </div>

      {loadError && (
        <div className="alert alert-danger">
          {loadError}
        </div>
      )}

      <div className="table-container">
        {loading ? (
          <Loader message="Loading vouchers..." />
        ) : vouchers.length === 0 ? (
          <div className="table-empty">
            {isFiltered ? 'No vouchers match these filters.' : 'No vouchers generated yet.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                {hasMultipleRouters && <th>Router</th>}
                <th>Package</th>
                <th>Status</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id}>
                  <td className="cell-code">
                    <span className="code-with-copy">
                      {v.code}
                      {(v.status === 'unused' || v.status === 'active') && <CopyButton text={v.code} toastMessage={`${v.code} copied`} />}
                    </span>
                  </td>

                  {hasMultipleRouters && (
                    <td className="cell-strong">
                      {v.packages?.router_name || 'Any'}
                    </td>
                  )}

                  <td>{v.packages?.name}</td>
                  <td>
                    <span className={`badge ${v.status === 'unused' ? 'badge-success' :
                      v.status === 'active' ? 'badge-warning' :
                        'badge-neutral'
                      }`}>
                      {v.status === 'cancelled' ? 'revoked' : v.status}
                    </span>
                    {v.status === 'active' && v.expires_at && (
                      <span className="cell-sub">{getRemainingTime(v.expires_at)}</span>
                    )}
                  </td>
                  <td className="col-actions">
                    {v.status === 'unused' || v.status === 'active' ? (
                      <button onClick={() => openRevoke(v)} className="btn btn-sm btn-danger">
                        Revoke
                      </button>
                    ) : (
                      <span className="cell-muted">
                        {v.status === 'cancelled' ? 'Revoked' : 'Expired'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && vouchers.length > 0 && (
        <div className="pager">
          <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => fetchVouchers(page - 1)}>
            Previous
          </button>
          <span className="cell-muted">
            Page {page} of {totalPages}
          </span>
          <button className="btn btn-sm btn-secondary" disabled={page === totalPages} onClick={() => fetchVouchers(page + 1)}>
            Next
          </button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Generate Vouchers</h2>
            <p className="modal-sub">Each code gives one customer the package you choose.</p>

            {errorMsg && (
              <div className="alert alert-danger">
                {errorMsg}
              </div>
            )}

            {!generatedCodes ? (
              packages.length === 0 ? (
                <div>
                  <p className="notice notice-info">You need to create a package before you can generate vouchers.</p>
                  <div className="modal-actions">
                    <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Close</button>
                  </div>
                </div>
              ) : (
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
                  <div className="modal-actions">
                    <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={isGenerating}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={!quantity || isGenerating}>
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <div>
                <div className="alert alert-success">Successfully generated {generatedCodes.length} vouchers!</div>
                <div className="code-grid">
                  {generatedCodes.map((code, idx) => (
                    <div key={idx} className="code-chip">{code}</div>
                  ))}
                </div>
                <div className="modal-actions">
                  <CopyButton text={generatedCodes.join('\n')} label="Copy all" toastMessage={`${generatedCodes.length} codes copied`} />
                  <button onClick={() => setShowModal(false)} className="btn btn-primary">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {revokeTarget && (
        <div className="modal-overlay">
          <div className="modal-content modal-narrow modal-center">
            <h2 className="modal-title danger">Revoke Voucher?</h2>
            <p className="modal-sub">
              Are you sure you want to revoke voucher <strong>{revokeTarget.code}</strong>?<br /><br />
              {revokeTarget.status === 'active'
                ? 'This will immediately disconnect the customer from the WiFi and they will not be able to use this code again.'
                : 'This code will no longer be usable.'}
            </p>

            {revokeError && (
              <div className="alert alert-danger" style={{ textAlign: 'left' }}>
                {revokeError}
              </div>
            )}

            <div className="modal-actions">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={isRevoking}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevoke}
                disabled={isRevoking}
                className="btn btn-solid-danger"
              >
                {isRevoking ? 'Revoking...' : 'Yes, Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}