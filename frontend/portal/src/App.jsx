import React, { useState, useEffect } from 'react';
import apiClient from './api/client';
import './shared/styles/variables.css';
import './shared/styles/base.css';
import './shared/styles/components.css';

export default function App() {
  const [hotelInfo, setHotelInfo] = useState(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);

  const queryParams = new URLSearchParams(window.location.search);
  const routerToken = queryParams.get('router');
  const macAddress = queryParams.get('mac') || '00:00:00:00:00:00';
  const ipAddress = queryParams.get('ip') || null;

  useEffect(() => {
    if (!routerToken) {
      setErrorMessage('This portal is not configured correctly (Missing Router Token).');
      return;
    }
    apiClient.get(`/portal/info/${routerToken}`)
      .then(res => setHotelInfo(res.data.data))
      .catch(() => setErrorMessage('Invalid or inactive router.'));
  }, [routerToken]);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!voucherCode) return;
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await apiClient.post('/portal/redeem', {
        router_token: routerToken,
        code: voucherCode,
        mac_address: macAddress,
        ip_address: ipAddress
      });
      setSuccessData(res.data.data);
      setStatus('success');
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Connection failed.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'var(--light)' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', margin: '0 auto 20px' }}>✓</div>
          <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Connected!</h1>
          <p style={{ color: 'var(--gray)', marginBottom: '20px' }}>You have internet access for <strong>{successData.duration_minutes} minutes</strong> at <strong>{successData.speed_down_mbps} Mbps</strong>.</p>
          <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'var(--light)' }}>
      <div className="card" style={{ maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold', margin: '0 auto 20px' }}>
          {hotelInfo?.business_name ? hotelInfo.business_name.charAt(0) : 'W'}
        </div>
        <h1 style={{ fontSize: '22px', marginBottom: '8px' }}>{hotelInfo?.business_name || 'Welcome'}</h1>
        <p style={{ color: 'var(--gray)', marginBottom: '30px', fontSize: '14px' }}>Enter your voucher code to connect.</p>

        {errorMessage && <div style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-soft)', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>{errorMessage}</div>}

        <form onSubmit={handleConnect}>
          <input 
            className="form-control"
            type="text" 
            placeholder="000000" 
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
            disabled={status === 'loading'}
            maxLength={6}
            style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '4px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '15px' }}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={status === 'loading' || voucherCode.length < 6}>
            {status === 'loading' ? 'Connecting...' : 'Connect'}
          </button>
        </form>
        <p style={{ fontSize: '12px', color: 'var(--gray-light)', marginTop: '30px' }}>Powered by OSWAGOTech WiFi</p>
      </div>
    </div>
  );
}