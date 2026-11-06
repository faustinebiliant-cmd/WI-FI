import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Loader from '../shared/components/Loader';

// A site ID from the Omada controller: 24 characters 0-9 and a-f
const SITE_ID_RE = /^[0-9a-f]{24}$/;

// TP-Link access point status, as the controller reports it (checked every 5 minutes)
const AP_LABEL = {
  online: 'Online',
  offline: 'Offline',
  pending: 'Pending (adopt it)',
  heartbeat_missed: 'Heartbeat missed',
  isolated: 'Isolated',
  not_found: 'Not in the site'
};
const ADOPT_ERROR = { wrong_login: 'wrong login on the access point', no_answer: 'access point did not answer', failed: 'adopt failed' };

const apBadgeClass = (status) =>
  status === 'online' ? 'badge-success'
    : ['offline', 'heartbeat_missed', 'isolated'].includes(status) ? 'badge-danger'
      : status === 'pending' ? 'badge-warning' : 'badge-neutral';

export default function RoutersPage() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);

  // "Set site ID" for a TP-Link router
  const [siteTarget, setSiteTarget] = useState(null);
  const [siteInput, setSiteInput] = useState('');
  const [siteError, setSiteError] = useState('');
  const [siteSaving, setSiteSaving] = useState(false);

  // TP-Link access points waiting in the controller (with the Open API key)
  const [waiting, setWaiting] = useState(null);

  const load = () =>
    apiClient.get('/platform/routers')
      .then(res => setRouters(res.data.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));

  const loadWaiting = () =>
    apiClient.get('/platform/omada/waiting')
      .then(res => setWaiting(res.data.enabled ? res.data.data : null))
      .catch(() => setWaiting(null));

  useEffect(() => { load(); loadWaiting(); }, []);

  const openSite = (router) => {
    setSiteTarget(router);
    setSiteInput(router.omada_site_id || '');
    setSiteError('');
  };

  const saveSite = async (e) => {
    e.preventDefault();
    const value = siteInput.trim().toLowerCase();
    if (!SITE_ID_RE.test(value)) {
      setSiteError('The site ID has 24 characters (0-9 and a-f), for example 6aebf7665e69d22b0e493f11.');
      return;
    }
    setSiteSaving(true);
    setSiteError('');
    try {
      await apiClient.patch(`/platform/routers/${siteTarget.id}/omada-site`, { site_id: value });
      setSiteTarget(null);
      load();
    } catch (error) {
      setSiteError(error.response?.data?.error || 'Failed to save the site ID.');
    } finally {
      setSiteSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>All Routers</h1>
          <p>Every router across all businesses. New TP-Link routers get their controller site automatically; older ones made by hand need their site ID (Setup Guide, "TP-Link only").</p>
        </div>
      </div>

      {waiting && waiting.length > 0 && (
        <div className="notice notice-warning">
          <strong>TP-Link access points waiting in the controller:</strong>
          {waiting.map((w) => (
            <div key={w.mac} className="ap-line">
              {w.mac} {w.model}{' '}
              {w.registered
                ? <span className="badge badge-neutral">registered by a business: Oswagolink adopts it</span>
                : <span className="badge badge-danger">no business registered this MAC: never adopted</span>}
            </div>
          ))}
        </div>
      )}

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
                <th>Type</th>
                <th>Location</th>
                <th>Status</th>
                <th className="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => {
                const isOmada = router.device_type === 'omada';
                const aps = Array.isArray(router.aps) ? router.aps : [];
                return (
                  <tr key={router.id}>
                    <td className="cell-strong">{router.tenant_name || 'Unknown'}</td>
                    <td>
                      {router.name}
                      {isOmada && aps.map((a) => (
                        <span key={a.mac} className="cell-sub ap-line">
                          Access point {a.mac}
                          {a.status && <span className={`badge ${apBadgeClass(a.status)}`}>{AP_LABEL[a.status] || a.status}</span>}
                          {router.site_auto && !a.adopted && <span className="badge badge-warning">not adopted yet{a.adopt_error ? `: ${ADOPT_ERROR[a.adopt_error] || a.adopt_error}` : ''}</span>}
                        </span>
                      ))}
                      {isOmada && router.omada_site_id && (
                        <span className="cell-sub">
                          Site {router.omada_site_id} ({router.site_auto ? 'made by Oswagolink' : 'made by hand'})
                          {router.wifi_name ? `, WiFi "${router.wifi_name}"` : ''}
                        </span>
                      )}
                    </td>
                    <td>{isOmada ? 'TP-Link' : 'MikroTik'}</td>
                    <td>{router.location_label || '-'}</td>
                    <td>
                      {isOmada && !router.omada_site_id ? (
                        <span className="badge badge-warning">Needs site ID</span>
                      ) : (
                        <span className={`badge ${router.status === 'online' ? 'badge-success' : 'badge-danger'}`}>
                          {router.status}
                        </span>
                      )}
                    </td>
                    <td className="col-actions">
                      {isOmada && !router.site_auto && (
                        <button onClick={() => openSite(router)} className="btn btn-sm btn-soft">
                          {router.omada_site_id ? 'Change site ID' : 'Set site ID'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {siteTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Site ID for {siteTarget.name}</h2>
            <p className="modal-sub">
              {siteTarget.tenant_name}. Create the business's site in the Omada controller first, then paste its
              site ID here (the 24 characters after <code>site=</code> in a portal link, or from the
              controller's address bar when the site is open).
            </p>
            {siteError && <div className="alert alert-danger">{siteError}</div>}
            <form onSubmit={saveSite}>
              <div className="form-group">
                <label>Site ID</label>
                <input
                  className="form-control"
                  required
                  type="text"
                  maxLength={24}
                  placeholder="6aebf7665e69d22b0e493f11"
                  autoCorrect="off"
                  spellCheck={false}
                  value={siteInput}
                  onChange={e => setSiteInput(e.target.value.toLowerCase().replace(/[^0-9a-f]/g, ''))}
                  disabled={siteSaving}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setSiteTarget(null)} disabled={siteSaving} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={siteSaving} className="btn btn-primary">{siteSaving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
