import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';
import { useToast } from '../shared/components/Toast';
import { FiCopy } from 'react-icons/fi';
import { onlyNameChars } from '../shared/inputRules';


// Longer commands are hidden until "Show command" is pressed; short ones stay visible
const LONG_COMMAND = 120;

// One command with its own copy button
function CommandBox({ title, note, text, tone = 'blue' }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const isLong = text.length > LONG_COMMAND;
  const [showText, setShowText] = useState(!isLong);

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
      {showText && <code className="cmd-code">{text}</code>}
      <div className="cmd-actions">
        <button onClick={copy} className={`btn btn-sm ${copied ? 'btn-copied' : 'btn-primary'}`}>
          {copied ? 'Copied!' : <><FiCopy size={18} /> Copy Command</>}
        </button>
        {isLong && (
          <button type="button" onClick={() => setShowText(!showText)} className="btn btn-sm btn-link">
            {showText ? 'Hide command' : 'Show command'}
          </button>
        )}
        {failed && <span className="cell-muted">Copy failed. Press "Show command", select the text, and copy it by hand.</span>}
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

  const [formData, setFormData] = useState({ name: '', location_label: '', ap_mac: '' });
  // '' = not chosen yet, 'mikrotik' or 'omada' (TP-Link only)
  const [routerType, setRouterType] = useState('');
  // After adding a TP-Link router: what happens next (no setup commands)
  const [omadaNext, setOmadaNext] = useState(null);

  const openAdd = () => {
    setRouterType('');
    setFormData({ name: '', location_label: '', ap_mac: '' });
    setErrorMsg('');
    setShowModal(true);
  };

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
      if (routerType === 'omada') {
        // TP-Link only: the access point's MAC; Oswagolink finishes the setup
        const res = await apiClient.post('/tenant/routers', {
          device_type: 'omada',
          name: formData.name,
          location_label: formData.location_label,
          ap_mac: formData.ap_mac
        });
        setShowModal(false);
        setOmadaNext(res.data && res.data.data);
        setFormData({ name: '', location_label: '', ap_mac: '' });
        fetchRouters();
        return;
      }

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
      setFormData({ name: '', location_label: '', ap_mac: '' });
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

  // "Show setup commands again": the server makes a NEW setup link (valid 30 minutes)
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

  // Switches on RouterOS's built-in list of trusted certificate authorities (like a phone's),
  // so the router can check that it really talks to oswagolink.co.tz. Older RouterOS versions do
  // not have this setting: :parse turns that into a clear message instead of a syntax error.
  const trustCommand =
    `:do { [[:parse "/certificate settings set builtin-trust-anchors=trusted"]] } on-error={ :error "ROUTEROS TOO OLD - update RouterOS (System > Packages > Check For Updates), then paste step 1 again. Nothing was changed." }`;
  // check-certificate: the router refuses to run a script from anyone pretending to be our server
  const setupCommand =
    `/tool fetch url="https://oswagolink.co.tz/api/provision/bootstrap/${setupToken}" dst-path=bootstrap.rsc check-certificate=yes-without-crl; :delay 2s; /import file-name=bootstrap.rsc; /file remove bootstrap.rsc`;
  // The hEX has no clock battery: after a power cut, or when new, its date can be far off, and a
  // certificate check with a wrong date fails. So the clock is set from the internet FIRST.
  const clockCommand =
    `/system ntp client set enabled=yes servers=time.google.com,pool.ntp.org,time.cloudflare.com; :local n 0; :while (([/system ntp client get status] != "synchronized") && ($n < 30)) do={ :delay 2s; :set n ($n + 1) }; :if ([/system ntp client get status] != "synchronized") do={ :error "CLOCK NOT SET - the router could not get the time from the internet. Check that the internet cable is in ether1, then paste step 1 again." } else={ :put "OK - the router clock is correct" }`;
  // New routers can have some features switched off ("device-mode"). The setup needs the
  // scheduler (WireGuard start and watchdog), fetch (downloads) and the hotspot. Switching them on
  // only takes effect after the power is unplugged within 5 minutes, so the command asks for that
  // and stops; if the power is not unplugged in time, it stops with a message instead of going on.
  const deviceModeCommand =
    `:if (![/system device-mode get scheduler] || ![/system device-mode get fetch] || ![/system device-mode get hotspot]) do={ :put "SOME FEATURES ARE OFF - UNPLUG THE ROUTER'S POWER NOW, plug it back in, log in again and paste step 1 again. Nothing else was changed."; /system device-mode update scheduler=yes fetch=yes hotspot=yes; :error "THE POWER WAS NOT UNPLUGGED IN TIME - paste step 1 again and unplug the power within 5 minutes." }`;
  // One paste: trust, features, clock, then setup. Any :error stops the line before the next part runs.
  const trustAndSetupCommand = `${trustCommand}; ${deviceModeCommand}; ${clockCommand}; ${setupCommand}`;
  // A leftover FILE named flash/hotspot (from earlier failed attempts) makes reset-html fail; a real folder is never touched
  const resetHtmlCommand =
    `:foreach f in=[/file find where name="flash/hotspot" and type!="directory"] do={ /file remove $f }\n/ip hotspot reset-html`;
  const loginFetchCommand =
    `/file remove flash/hotspot/login.html\n/tool fetch url="https://oswagolink.co.tz/api/provision/login/${setupToken}" dst-path=flash/hotspot/login.html check-certificate=yes-without-crl`;

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>Routers</h1>
          <p>Your MikroTik routers and TP-Link access points.</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary">
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
                <th>Type</th>
                <th>Status</th>
                <th>Address</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => {
                const isOmada = router.device_type === 'omada';
                const isOnline = (router.status || '').toLowerCase() === 'online';
                const waiting = isOmada ? !router.site_ready : (!router.ip_address || router.ip_address === '0.0.0.0');
                const apMacs = Array.isArray(router.ap_macs) ? router.ap_macs : [];
                return (
                  <tr key={router.id}>
                    <td className="cell-strong">{router.name}</td>
                    <td>{isOmada ? 'TP-Link' : 'MikroTik'}</td>
                    <td>
                      {isOmada && waiting ? (
                        <span className="badge">Waiting for Oswagolink</span>
                      ) : (
                        <span className={`badge ${isOnline ? 'badge-success' : 'badge-danger'}`}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </td>
                    <td className={waiting && !isOmada ? 'cell-muted' : undefined}>
                      {isOmada
                        ? (apMacs.length > 0 ? `Access point ${apMacs.join(', ')}` : '-')
                        : (waiting ? 'Waiting for setup' : router.ip_address)}
                    </td>
                    <td className="col-actions">
                      <div className="actions">
                        {!isOmada && !router.provisioned && (
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
      {showModal && !routerType && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">What do you have?</h2>
            <p className="modal-sub">Choose the equipment for this location.</p>
            <button type="button" className="choice-option" onClick={() => setRouterType('mikrotik')}>
              <span>
                <strong>MikroTik router</strong>
                <small>I have a MikroTik router. My WiFi access points can be any brand (also TP-Link).</small>
              </span>
            </button>
            <button type="button" className="choice-option" onClick={() => setRouterType('omada')}>
              <span>
                <strong>TP-Link only</strong>
                <small>I have only a TP-Link Omada access point (EAP), no MikroTik.</small>
              </span>
            </button>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showModal && routerType && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">{routerType === 'omada' ? 'Your TP-Link Access Point' : 'Name Your Router'}</h2>
            <p className="modal-sub">
              {routerType === 'omada'
                ? 'Oswagolink then prepares your WiFi and connects the access point to your account.'
                : 'Next you get the setup commands for this router.'}
            </p>
            {errorMsg && (
              <div className="alert alert-danger">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>{routerType === 'omada' ? 'Name' : 'Router Name'}</label>
                <input className="form-control" required type="text" placeholder="e.g. Main Lobby" maxLength={40} value={formData.name} onChange={e => setFormData({ ...formData, name: onlyNameChars(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Location (optional)</label>
                <input className="form-control" type="text" placeholder="e.g. Ground floor" maxLength={60} value={formData.location_label} onChange={e => setFormData({ ...formData, location_label: onlyNameChars(e.target.value) })} />
              </div>
              {routerType === 'omada' && (
                <div className="form-group">
                  <label>Access point MAC (on its sticker)</label>
                  <input
                    className="form-control"
                    required
                    type="text"
                    placeholder="e.g. D4-D6-DF-A5-F8-D2"
                    maxLength={17}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={formData.ap_mac}
                    // Only 0-9, A-F and the separators - or :
                    onChange={e => setFormData({ ...formData, ap_mac: e.target.value.toUpperCase().replace(/[^0-9A-F:-]/g, '') })}
                  />
                  <p className="form-hint">Only a phone on this access point can use the vouchers of this router.</p>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setRouterType('')} disabled={isCreating} className="btn btn-secondary">Back</button>
                <button type="submit" disabled={isCreating} className="btn btn-primary">
                  {isCreating ? 'Creating...' : (routerType === 'omada' ? 'Add' : 'Generate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AFTER ADDING A TP-LINK ROUTER: what happens next */}
      {omadaNext && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Access point added</h2>
            <p className="modal-sub"><strong>{omadaNext.name}</strong> is waiting for Oswagolink.</p>
            <ol className="modal-sub">
              <li>Oswagolink prepares your WiFi (your WiFi name, the customer page and your speed).</li>
              <li>Your technician plugs the access point into your internet box and points it to Oswagolink.</li>
              <li>Oswagolink connects it: the status changes to <strong>Online</strong>.</li>
              <li>Switch off (or put a password on) the internet box's own WiFi, so customers use yours.</li>
            </ol>
            <p className="notice notice-info">Meanwhile you can already create packages for it on the Packages page.</p>
            <div className="modal-actions">
              <button onClick={() => setOmadaNext(null)} className="btn btn-primary">OK</button>
            </div>
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
              <strong>How to connect:</strong> put the internet cable (from your modem) in <strong>port 1 (ether1)</strong>. Connect your computer to <strong>port 2, 3, 4 or 5</strong> and open Winbox <strong>by MAC address</strong> (pick the router in the Neighbors list), not by IP address. The router must have internet before step 1.
            </p>
            <p className="notice notice-info">
              <strong>Router password:</strong> the first time you log in, Winbox asks you to set a new password. Choose a strong one and write it down: you need it every time you open the router.
            </p>
            <p className="notice notice-warning" style={{ marginBottom: '20px' }}>
              The setup commands below contain a secret: never share them. They work for 30 minutes, so open them when you are at the router. If they expire, or you close this window too early, press "Setup Commands" on the Routers page to get new ones (only while the router is not set up yet).
            </p>

            <CommandBox
              title="Step 1: Set up the router (one paste)"
              note={'Copy and paste it into the terminal. The router sets its clock (up to 1 minute), downloads its setup from our server over a checked, secure connection, builds the hotspot and registers itself on this account. Wait until it shows SETUP COMPLETE. If it shows SOME FEATURES ARE OFF: unplug the router\'s power, plug it back in, log in again and paste step 1 again (a new router needs this once). If it stops with CLOCK NOT SET or a "failure" line, check that the internet cable is in ether1 and paste it again. ROUTEROS TOO OLD: update RouterOS first.'}
              text={trustAndSetupCommand}
            />

            <CommandBox
              title="Step 2 (part 1 of 2): Build the customer login pages"
              note="Paste both lines together, then type 0 when it asks for numbers, and y to confirm. Wait until it finishes before part 2."
              text={resetHtmlCommand}
            />

            <CommandBox
              title="Step 2 (part 2 of 2): Install your customer login page"
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