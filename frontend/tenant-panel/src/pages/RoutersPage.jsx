import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import { useToast } from '../shared/components/Toast';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

// Official SHA-256 fingerprint of Let's Encrypt's root certificate "ISRG Root X1"
// (valid until 2035). It signs the certificate of oswagolink.co.tz.
const ISRG_ROOT_X1_FINGERPRINT = '96bcec06264976f37460779acf28c5a7cfe8a3c0aae11a8ffcee05c0bddf08c6';

// One command with its own copy button
function CommandBox({ title, note, text, tone = 'blue' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

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
    <div className={`cmd-box ${tone === 'amber' ? 'warning' : ''}`}>
      <p className="cmd-title">{title}</p>
      {note && <p className="cmd-note">{note}</p>}
      <code className="cmd-code">{text}</code>
      <div className="cmd-actions">
        <button onClick={copy} className={`btn btn-sm ${copied ? 'btn-copied' : 'btn-primary'}`}>
          {copied ? 'Copied!' : <><CopyIcon /> Copy Command</>}
        </button>
        {failed && <span className="cell-muted">Copy failed. Click the text above to select it, then copy it by hand.</span>}
      </div>
    </div>
  );
}

export default function RoutersPage() {
  const toast = useToast();
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
  const [actionError, setActionError] = useState('');

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

  // "Show setup commands again": the server makes a NEW setup link (valid 12 hours)
  const showSetupAgain = async (router) => {
    setActionError('');
    try {
      const res = await apiClient.post(`/tenant/routers/${router.id}/setup-token`);
      const token = res.data && res.data.data && res.data.data.provision_token;
      if (!token) {
        setActionError('The server did not return a setup token. Please contact support.');
        return;
      }
      setSetupToken(token);
      setShowSetupModal(true);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to create new setup commands.');
    }
  };

  const handleDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await apiClient.delete(`/tenant/routers/${deleteTarget.id}`);
      toast(`Router "${deleteTarget.name}" deleted`);
      closeDelete();
      fetchRouters();
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Failed to delete router');
    } finally {
      setIsDeleting(false);
    }
  };

  // Teaches a factory router to trust our server's certificate (Let's Encrypt root, ISRG Root X1).
  // The certificate is downloaded without a check (the router cannot check anything yet), so it is
  // accepted only if its SHA-256 fingerprint is exactly the official one. Safe to run twice.
  const trustCommand =
    `:if ([:len [/certificate find where fingerprint="${ISRG_ROOT_X1_FINGERPRINT}"]] = 0) do={ /tool fetch url="https://letsencrypt.org/certs/isrgrootx1.pem" dst-path=isrgrootx1.pem check-certificate=no; :delay 2s; /certificate import file-name=isrgrootx1.pem passphrase=""; /file remove isrgrootx1.pem }; /certificate remove [find where common-name="ISRG Root X1" and fingerprint!="${ISRG_ROOT_X1_FINGERPRINT}"]; :if ([:len [/certificate find where fingerprint="${ISRG_ROOT_X1_FINGERPRINT}" and trusted=yes]] = 0) do={ :error "CERTIFICATE CHECK FAILED - nothing else was changed. Check the internet connection and run this step again." } else={ :put "OK - the router now trusts oswagolink.co.tz" }`;
  // check-certificate: the router refuses to run a script from anyone pretending to be our server
  const setupCommand =
    `/tool fetch url="https://oswagolink.co.tz/api/provision/bootstrap/${setupToken}" dst-path=bootstrap.rsc check-certificate=yes-without-crl; :delay 2s; /import file-name=bootstrap.rsc; /file remove bootstrap.rsc`;
  // The hEX has no clock battery: after a power cut, or when new, its date can be far off, and a
  // certificate check with a wrong date fails. So the clock is set from the internet FIRST.
  const clockCommand =
    `/system ntp client set enabled=yes servers=time.google.com,pool.ntp.org,time.cloudflare.com; :local n 0; :while (([/system ntp client get status] != "synchronized") && ($n < 30)) do={ :delay 2s; :set n ($n + 1) }; :if ([/system ntp client get status] != "synchronized") do={ :error "CLOCK NOT SET - the router could not get the time from the internet. Check that the internet cable is in ether1, then paste step 2 again." } else={ :put "OK - the router clock is correct" }`;
  // One paste: clock, then trust, then setup. Any :error stops the line before the next part runs.
  const trustAndSetupCommand = `${clockCommand}; ${trustCommand}; ${setupCommand}`;
  const loginFetchCommand =
    `/file remove flash/hotspot/login.html\n/tool fetch url="https://oswagolink.co.tz/api/provision/login/${setupToken}" dst-path=flash/hotspot/login.html check-certificate=yes-without-crl`;

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Routers</h1>
          <p>Manage your MikroTik hardware.</p>
        </div>
        <button onClick={() => { setShowModal(true); setErrorMsg(''); }} className="btn btn-primary">
          + Add Router
        </button>
      </div>

      {(loadError || actionError) && (
        <div className="alert alert-danger">
          {loadError || actionError}
        </div>
      )}

      <div className="table-container">
        {loading ? (
          <Loader message="Loading routers..." />
        ) : routers.length === 0 ? (
          <div className="table-empty">No routers yet. Click "+ Add Router" to set up your first one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>IP Address</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => {
                const isOnline = (router.status || '').toLowerCase() === 'online';
                const waiting = !router.ip_address || router.ip_address === '0.0.0.0';
                return (
                  <tr key={router.id}>
                    <td className="cell-strong">{router.name}</td>
                    <td>
                      <span className={`badge ${isOnline ? 'badge-success' : 'badge-danger'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className={waiting ? 'cell-muted' : undefined}>
                      {waiting ? 'Waiting for setup' : router.ip_address}
                    </td>
                    <td className="col-actions">
                      <div className="actions">
                        {!router.provisioned && (
                          <button onClick={() => showSetupAgain(router)} className="btn btn-sm btn-soft">
                            Setup Commands
                          </button>
                        )}
                        <button onClick={() => { setDeleteError(''); setDeleteTarget(router); }} className="btn btn-sm btn-danger">
                          Delete
                        </button>
                      </div>
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
            <h2 className="modal-title">Name Your Router</h2>
            <p className="modal-sub">Next you get the setup commands for this router.</p>
            {errorMsg && (
              <div className="alert alert-danger">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Router Name</label>
                <input className="form-control" required type="text" placeholder="e.g. Main Lobby" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Location (optional)</label>
                <input className="form-control" type="text" placeholder="e.g. Ground floor" value={formData.location_label} onChange={e => setFormData({ ...formData, location_label: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} disabled={isCreating} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={isCreating} className="btn btn-primary">
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
          <div className="modal-content modal-wide">
            <h2 className="modal-title">Connect Your MikroTik</h2>
            <p className="modal-sub">
              Use a brand-new (or factory-reset) router with its default configuration.
            </p>
            <p className="notice notice-info">
              <strong>How to connect:</strong> put the internet cable (from your modem) in <strong>port 1 (ether1)</strong>. Connect your computer to <strong>port 2, 3, 4 or 5</strong> and open Winbox <strong>by MAC address</strong> (pick the router in the Neighbors list), not by IP address. The router must have internet before step 2.
            </p>
            <p className="notice notice-warning" style={{ marginBottom: '20px' }}>
              The setup commands below contain a secret: never share them. They work for 12 hours. If they expire, or you close this window too early, press "Setup Commands" on the Routers page to get new ones (only while the router is not set up yet).
            </p>

            <CommandBox
              tone="amber"
              title="Step 1: Set the router password"
              note="Replace the words in capitals with a strong password of your own, and write it down. Without this the router has no password."
              text={'/user set admin password="CHOOSE_A_STRONG_PASSWORD"'}
            />

            <CommandBox
              title="Step 2: Set up the router (one paste)"
              note={'The router first sets its clock from the internet (up to 1 minute), checks our server\'s certificate, then builds the hotspot and registers itself on this account. Wait until it shows SETUP COMPLETE. If it stops with CLOCK NOT SET or CERTIFICATE CHECK FAILED, check that the internet cable is in ether1 and paste it again.'}
              text={trustAndSetupCommand}
            />

            <CommandBox
              tone="amber"
              title={'Only if step 2 stopped with "SCHEDULER IS OFF"'}
              note="Run this, then unplug the router's power and plug it back in within 5 minutes. Then paste step 2 again. Nothing was changed by the stopped attempt."
              text="/system device-mode update scheduler=yes"
            />

            <CommandBox
              title="Step 3 (part 1 of 2): Build the customer login pages"
              note="Run this, then type 0 when it asks for numbers, and y to confirm. Wait until it finishes before part 2."
              text="/ip hotspot reset-html"
            />

            <CommandBox
              title="Step 3 (part 2 of 2): Install your customer login page"
              note="Paste both lines together. Afterwards the router shows your portal to your customers."
              text={loginFetchCommand}
            />

            <div className="modal-actions">
              <button onClick={() => { setShowSetupModal(false); setSetupToken(''); }} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ROUTER MODAL */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content modal-narrow">
            <h2 className="modal-title danger">Delete Router</h2>
            <p className="modal-sub">Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will delete all packages and vouchers.</p>
            {deleteError && (
              <div className="alert alert-danger">
                {deleteError}
              </div>
            )}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Type DELETE to confirm</label>
              <input className="form-control" type="text" placeholder="DELETE" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button onClick={closeDelete} disabled={isDeleting} className="btn btn-secondary">Cancel</button>
              <button onClick={handleDelete} disabled={deleteInput !== 'DELETE' || isDeleting} className="btn btn-solid-danger">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}