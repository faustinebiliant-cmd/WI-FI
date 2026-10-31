import React, { useState, useEffect } from 'react';
import apiClient from './api/client';
import './shared/styles/variables.css';
import './shared/styles/base.css';
import './shared/styles/components.css';

// Switch to true only when the real mobile payment (AzamPay) is connected
const PAYMENTS_ENABLED = false;

export default function App() {
  const [businessInfo, setBusinessInfo] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);
  
  const [activeTab, setActiveTab] = useState(PAYMENTS_ENABLED ? 'buy' : 'voucher');
  const [voucherCode, setVoucherCode] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0);

  const queryParams = new URLSearchParams(window.location.search);
  const routerToken = queryParams.get('router');
  // The router adds the device ID (mac) when it sends the customer here.
  // Without it a voucher cannot be tied to the device, so the form stays locked.
  const macAddress = queryParams.get('mac') || null;
  const ipAddress = queryParams.get('ip') || null;
  
  // NEW: Capture the MikroTik login URLs
  const loginUrl = queryParams.get('login') || null;
  const origUrl = queryParams.get('orig') || null;

  useEffect(() => {
    if (!routerToken) {
      setErrorMessage('This portal is not configured correctly (Missing Router Token).');
      return;
    }
    apiClient.get(`/portal/info/${routerToken}`)
      .then(res => setBusinessInfo(res.data.data))
      .catch((err) => setErrorMessage(err.response?.data?.error || 'Invalid or inactive router.'));
  }, [routerToken]);

  useEffect(() => {
    const checkLockout = () => {
      const lockoutUntil = localStorage.getItem('portal_lockout_until');
      if (lockoutUntil) {
        const remaining = Math.ceil((parseInt(lockoutUntil) - Date.now()) / 1000);
        if (remaining > 0) {
          setLockoutTimeLeft(remaining);
        } else {
          localStorage.removeItem('portal_lockout_until');
          localStorage.removeItem('portal_fail_count');
          setLockoutTimeLeft(0);
          setErrorMessage('');
        }
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (mins) => {
    if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440} Day${mins / 1440 > 1 ? 's' : ''}`;
    if (mins >= 60 && mins % 60 === 0) return `${mins / 60} Hour${mins / 60 > 1 ? 's' : ''}`;
    return `${mins} Mins`;
  };

  // "1d 4h", "4h 12m" or "12m", from the minutes left that the server sent
  const formatLeft = (mins) => {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // End of the voucher in Tanzania time, e.g. "31 Oct, 18:30"
  const formatEnd = (expiresAt) => {
    const end = new Date(expiresAt);
    if (isNaN(end.getTime())) return null;
    return end.toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!voucherCode || lockoutTimeLeft > 0) return;
    
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await apiClient.post('/portal/redeem', {
        router_token: routerToken,
        code: voucherCode,
        mac_address: macAddress,
        ip_address: ipAddress,
        login_url: loginUrl, // Send to backend
        orig_url: origUrl    // Send to backend
      });
      
      localStorage.removeItem('portal_fail_count');
      setSuccessData(res.data.data);
      setStatus('success');

      // NEW: If we have the MikroTik login URL, submit it to actually unlock the internet!
      if (loginUrl) {
        // MikroTik expects the username and password to be the voucher code
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = loginUrl;

        const usernameInput = document.createElement('input');
        usernameInput.type = 'hidden';
        usernameInput.name = 'username';
        usernameInput.value = voucherCode.toUpperCase();
        form.appendChild(usernameInput);

        const passwordInput = document.createElement('input');
        passwordInput.type = 'hidden';
        passwordInput.name = 'password';
        passwordInput.value = voucherCode.toUpperCase();
        form.appendChild(passwordInput);

        // If there is an original URL (e.g. apple.com), tell MikroTik to go there after login
        if (origUrl) {
          const dstInput = document.createElement('input');
          dstInput.type = 'hidden';
          dstInput.name = 'dst';
          dstInput.value = origUrl;
          form.appendChild(dstInput);
        }

        document.body.appendChild(form);
        
        // Wait 2 seconds so they can see the "Connected!" screen, then unlock the internet
        setTimeout(() => {
          form.submit();
        }, 2000);
      }

    } catch (error) {
      let fails = parseInt(localStorage.getItem('portal_fail_count') || '0');
      fails++;
      localStorage.setItem('portal_fail_count', fails.toString());

      if (fails >= 5) {
        const lockoutUntil = Date.now() + (10 * 60 * 1000);
        localStorage.setItem('portal_lockout_until', lockoutUntil.toString());
        setLockoutTimeLeft(600);
        setErrorMessage('Too many invalid attempts. Please wait 10 minutes before trying again.');
      } else {
        const attemptsLeft = 5 - fails;
        setErrorMessage(`${error.response?.data?.error || 'Connection failed.'} (${attemptsLeft} attempts left)`);
      }
      setStatus('error');
    }
  };

  const handleBuy = (pkg) => {
    setSelectedPackage(pkg);
    setErrorMessage('');
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setStatus('loading');
    setErrorMessage('');

    try {
      await apiClient.post('/portal/pay', {
        router_token: routerToken,
        package_id: selectedPackage.id,
        phone_number: phoneNumber
      });
      
      setSuccessData({ 
        duration_minutes: selectedPackage.duration_minutes, 
        speed_down_mbps: selectedPackage.speed_down_kbps / 1024 
      });
      setStatus('success');
    } catch (error) {
      setErrorMessage('Payment failed. Please try again.');
      setStatus('error');
    }
  };

  const packages = businessInfo?.packages || [];
  const isLocked = lockoutTimeLeft > 0;
  const lockClock = `${Math.floor(lockoutTimeLeft / 60)}:${String(lockoutTimeLeft % 60).padStart(2, '0')}`;

  if (status === 'success') {
    const end = successData.expires_at && Number.isFinite(successData.remaining_minutes) ? formatEnd(successData.expires_at) : null;
    return (
      <div className="portal-page">
        <div className="portal-card">
          <div className="success-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <h1 className="portal-title">{successData.resumed ? 'Welcome back!' : 'Connected!'}</h1>
          <p className="portal-sub">Enjoy your internet.</p>

          <div className="success-time">
            {end ? (
              <>You have internet until <strong>{end}</strong><br />({formatLeft(successData.remaining_minutes)} left) at <strong>{successData.speed_down_mbps} Mbps</strong></>
            ) : (
              <>You have internet for <strong>{formatDuration(successData.duration_minutes)}</strong> at <strong>{successData.speed_down_mbps} Mbps</strong></>
            )}
          </div>

          {loginUrl ? (
            <span className="unlocking"><span className="spinner-sm" /> Unlocking internet...</span>
          ) : (
            <button onClick={() => window.location.reload()} className="btn btn-secondary btn-block">Done</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="portal-card">
        <div className="portal-logo">
          {businessInfo?.business_name ? businessInfo.business_name.charAt(0).toUpperCase() : 'W'}
        </div>
        <h1 className="portal-title">{businessInfo?.business_name || 'Welcome'}</h1>
        <p className="portal-sub">
          {PAYMENTS_ENABLED && activeTab === 'buy' ? 'Choose a package to buy.' : 'Enter your voucher code to connect.'}
        </p>

        {errorMessage && <div className="alert alert-danger">{errorMessage}</div>}

        {PAYMENTS_ENABLED && (
        <div className="tabs">
          <button className={`tab ${activeTab === 'buy' ? 'active' : ''}`} onClick={() => { setActiveTab('buy'); setErrorMessage(''); setSelectedPackage(null); }}>Buy WiFi</button>
          <button className={`tab ${activeTab === 'voucher' ? 'active' : ''}`} onClick={() => { setActiveTab('voucher'); setErrorMessage(''); setSelectedPackage(null); }}>Have a Voucher?</button>
        </div>
        )}

        {PAYMENTS_ENABLED && activeTab === 'buy' && (
          <div>
            {!selectedPackage ? (
              packages.length > 0 ? packages.map(pkg => (
                <button key={pkg.id} type="button" className="package-option" onClick={() => handleBuy(pkg)}>
                  <span>
                    <strong>{pkg.name}</strong>
                    <small style={{ display: 'block', color: 'var(--gray)' }}>{formatDuration(pkg.duration_minutes)} at {pkg.speed_down_kbps / 1024} Mbps</small>
                  </span>
                  <strong style={{ color: 'var(--primary)' }}>TZS {pkg.price_tzs.toLocaleString()}</strong>
                </button>
              )) : (
                <p className="portal-sub">No packages available at this time.</p>
              )
            ) : (
              <form onSubmit={submitPayment}>
                <div className="package-summary">
                  <strong>{selectedPackage.name}</strong>
                  <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '18px' }}>TZS {selectedPackage.price_tzs.toLocaleString()}</div>
                </div>

                <label className="form-label">Phone Number</label>
                <input
                  className="form-control"
                  type="tel"
                  placeholder="0712345678"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  required
                />

                <div className="button-row">
                  <button type="button" onClick={() => setSelectedPackage(null)} className="btn btn-secondary" disabled={status === 'loading'}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
                    {status === 'loading' ? 'Processing...' : 'Pay Now'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {activeTab === 'voucher' && (
          <form onSubmit={handleRedeem}>
            {!macAddress && (
              <div className="alert alert-danger">
                Your device could not be identified. Please connect to this WiFi network, then open any website so the login page appears again.
              </div>
            )}
            <input
              className="form-control code-input"
              type="text"
              placeholder="Voucher code"
              aria-label="Voucher code"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              disabled={status === 'loading' || isLocked}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={!macAddress || status === 'loading' || voucherCode.length < 6 || isLocked}
            >
              {status === 'loading' ? 'Connecting...' : isLocked ? `Locked (${lockClock})` : 'Connect'}
            </button>

            {/* So the customer knows what to ask the staff for */}
            {!PAYMENTS_ENABLED && packages.length > 0 && (
              <div className="price-list">
                <p className="price-list-title">Prices</p>
                {packages.map(pkg => (
                  <div key={pkg.id} className="price-row">
                    <span>{pkg.name}<small>{formatDuration(pkg.duration_minutes)} · {pkg.speed_down_kbps / 1024} Mbps</small></span>
                    <strong>TZS {pkg.price_tzs.toLocaleString()}</strong>
                  </div>
                ))}
                <p className="price-note">No code yet? Please ask the staff for a voucher.</p>
              </div>
            )}
          </form>
        )}

        <p className="portal-footer">Powered by OSWAGOTech WiFi</p>
      </div>
    </div>
  );
}
