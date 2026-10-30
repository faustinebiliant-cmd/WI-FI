import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

// One command with its own copy button
function CommandBox({ title, note, text, tone = 'blue' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const palette = {
    blue: { bg: '#eff6ff', border: '#bfdbfe', title: '#1e40af', code: '#1e40af', button: '#2563eb' },
    amber: { bg: '#fef3c7', border: '#f59e0b', title: '#92400e', code: '#0f172a', button: '#d97706' }
  }[tone];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setFailed(true);
    }
  };

  return (
    <div style={{ backgroundColor: palette.bg, border: `1px solid ${palette.border}`, padding: '15px', borderRadius: '6px', marginBottom: '16px' }}>
      <p style={{ color: palette.title, fontWeight: 'bold', margin: '0 0 6px 0', fontSize: '14px' }}>{title}</p>
      {note && <p style={{ color: '#475569', margin: '0 0 8px 0', fontSize: '13px' }}>{note}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <code style={{ backgroundColor: 'white', padding: '10px', borderRadius: '4px', color: palette.code, fontSize: '12px', border: '1px solid #cbd5e1', wordBreak: 'break-all', userSelect: 'all' }}>
          {text}
        </code>
        <button
          onClick={copy}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px', backgroundColor: copied ? '#10b981' : palette.button, color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
        >
          {copied ? 'Copied!' : <><CopyIcon /> Copy Command</>}
        </button>
        {failed && <span style={{ color: '#dc2626', fontSize: '12px' }}>Copy failed. Click the text above to select it, then copy it by hand.</span>}
      </div>
    </div>
  );
}

export default function RoutersPage() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupToken, setSetupToken] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [formData, setFormData] = useState({ name: '', location_label: '' });

  useEffect(() => { fetchRouters(); }, []);

  const fetchRouters = async () => {
    try {
      const res = await apiClient.get('/tenant/routers');
      setRouters(res.data.data);
      setLoadError('');
    } catch (error) {
      console.error(error);
      setLoadError('Failed to load routers. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (isCreating) return;
    setErrorMsg('');
    setIsCreating(true);
    try {
      // The server creates the router, its secret token and its API password
      const res = await apiClient.post('/tenant/routers', {
        name: formData.name,
        location_label: formData.location_label
      });
      const token = res.data && res.data.data && res.data.data.provision_token;
      if (!token) {
        setErrorMsg('The server did not return a setup token. Please contact support.');
        fetchRouters();
        return;
      }
      setSetupToken(token);
      setShowModal(false);
      setShowSetupModal(true);
      setFormData({ name: '', location_label: '' });
      fetchRouters();
    } catch (error) {
      setErrorMsg(error.response?.data?.error || 'Failed to create router');
    } finally {
      setIsCreating(false);
    }
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setDeleteInput('');
    setDeleteError('');
  };

  const handleDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await apiClient.delete(`/tenant/routers/${deleteTarget.id}`);
      closeDelete();
      fetchRouters();
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Failed to delete router');
    } finally {
      setIsDeleting(false);
    }
  };

  const setupCommand =
    `/tool fetch url="https://oswagolink.co.tz/api/provision/bootstrap/${setupToken}" dst-path=bootstrap.rsc; :delay 2s; /import file-name=bootstrap.rsc; /file remove bootstrap.rsc`;
  const loginFetchCommand =
    `/file remove flash/hotspot/login.html\n/tool fetch url="https://oswagolink.co.tz/api/provision/login/${setupToken}" dst-path=flash/hotspot/login.html`;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Routers</h1>
          <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Manage your MikroTik hardware.</p>
        </div>
        <button onClick={() => { setShowModal(true); setErrorMsg(''); }} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
          + Add Router
        </button>
      </div>

      {loadError && (
        <div style={{ color: '#dc2626', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
          {loadError}
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflowX: 'auto', width: '100%', maxWidth: '100%' }}>
        {loading ? (
          <Loader message="Loading routers..." />
        ) : routers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>No routers found.</div>
        ) : (
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Name</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Status</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>IP Address</th>
                <th style={{ padding: '12px 20px', color: '#6b7280' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => {
                const isOnline = (router.status || '').toLowerCase() === 'online';
                const waiting = !router.ip_address || router.ip_address === '0.0.0.0';
                return (
                  <tr key={router.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 'bold' }}>{router.name}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '50px', fontSize: '12px', fontWeight: 'bold', backgroundColor: isOnline ? '#ecfdf5' : '#fef2f2', color: isOnline ? '#059669' : '#dc2626' }}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', color: waiting ? '#9ca3af' : 'inherit' }}>
                      {waiting ? 'Waiting for setup' : router.ip_address}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <button onClick={() => { setDeleteError(''); setDeleteTarget(router); }} style={{ padding: '6px 12px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE ROUTER MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0 }}>Name Your Router</h2>
            {errorMsg && (
              <div style={{ color: '#dc2626', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input required type="text" placeholder="Router Name (e.g. Main Lobby)" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <input type="text" placeholder="Location (Optional)" value={formData.location_label} onChange={e => setFormData({ ...formData, location_label: e.target.value })} style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} disabled={isCreating} style={{ padding: '10px 20px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px' }}>Cancel</button>
                <button type="submit" disabled={isCreating} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                  {isCreating ? 'Creating...' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETUP MODAL */}
      {showSetupModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, fontSize: '20px' }}>Connect Your MikroTik</h2>
            <p style={{ color: '#64748b', marginBottom: '8px', fontSize: '14px' }}>
              Use a brand-new (or factory-reset) router with its default configuration, and make sure it has internet on port ether1.
            </p>
            <p style={{ color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
              The setup commands below contain a secret. They are shown only now, so finish the setup before you close this window, and never share them.
            </p>

            <CommandBox
              tone="amber"
              title="Step 1: Set the router password"
              note="Replace the words in capitals with a strong password of your own, and write it down. Without this the router has no password."
              text={'/user set admin password="CHOOSE_A_STRONG_PASSWORD"'}
            />

            <CommandBox
              tone="amber"
              title="Step 2: Check that scheduled tasks are allowed"
              note={'Run this: /system device-mode print. If it shows "scheduler: no", run the command below and then unplug the router\'s power and plug it back in within 5 minutes. If it already shows "scheduler: yes", skip the command.'}
              text="/system device-mode update scheduler=yes"
            />

            <CommandBox
              title="Step 3: Paste the setup command"
              note="The router builds the hotspot and registers itself on this account. Wait until it finishes."
              text={setupCommand}
            />

            <CommandBox
              title="Step 4a: Build the guest login pages"
              note="Run this, then type 0 when it asks for numbers, and y to confirm. Wait until it finishes before step 4b."
              text="/ip hotspot reset-html"
            />

            <CommandBox
              title="Step 4b: Install your guest login page"
              note="Paste both lines together. Afterwards the router shows your portal to guests."
              text={loginFetchCommand}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSetupModal(false); setSetupToken(''); }} style={{ padding: '10px 20px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ROUTER MODAL */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px', borderTop: '4px solid #dc2626' }}>
            <h2 style={{ marginTop: 0, color: '#dc2626', fontSize: '20px' }}>Delete Router</h2>
            <p style={{ fontSize: '14px', marginBottom: '20px' }}>Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will delete all packages and vouchers.</p>
            {deleteError && (
              <div style={{ color: '#dc2626', backgroundColor: '#fef2f2', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
                {deleteError}
              </div>
            )}
            <input type="text" placeholder="Type DELETE" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={closeDelete} disabled={isDeleting} style={{ padding: '10px 20px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleteInput !== 'DELETE' || isDeleting} style={{ padding: '10px 20px', backgroundColor: deleteInput === 'DELETE' ? '#dc2626' : '#fca5a5', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}