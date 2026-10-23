import React, { useState, useEffect } from 'react';
import apiClient from './api/client';
import './shared/styles/variables.css';
import './shared/styles/base.css';
import './shared/styles/components.css';

export default function App() {
  const [hotelInfo, setHotelInfo] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);
  
  // Tabs: 'buy' or 'voucher'
  const [activeTab, setActiveTab] = useState('buy');
  
  // Form states
  const [voucherCode, setVoucherCode] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');

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

  // Helper to format time for guests (Days/Hours instead of just minutes)
  const formatDuration = (mins) => {
    if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440} Day${mins / 1440 > 1 ? 's' : ''}`;
    if (mins >= 60 && mins % 60 === 0) return `${mins / 60} Hour${mins / 60 > 1 ? 's' : ''}`;
    return `${mins} Mins`;
  };

  const handleRedeem = async (e) => {
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

  if (status === 'success') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'var(--light)' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', margin: '0 auto 20px' }}>✓</div>
          <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Connected!</h1>
          <p style={{ color: 'var(--gray)', marginBottom: '20px' }}>You have internet access for <strong>{formatDuration(successData.duration_minutes)}</strong> at <strong>{successData.speed_down_mbps} Mbps</strong>.</p>
          <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'var(--light)' }}>
      <div className="card" style={{ maxWidth: '450px', textAlign: 'center', padding: '40px', width: '100%' }}>
        
        <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold', margin: '0 auto 20px' }}>
          {hotelInfo?.business_name ? hotelInfo.business_name.charAt(0) : 'W'}
        </div>
        <h1 style={{ fontSize: '22px', marginBottom: '8px' }}>{hotelInfo?.business_name || 'Welcome'}</h1>
        
        {errorMessage && <div style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-soft)', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>{errorMessage}</div>}

        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
          <button onClick={() => { setActiveTab('buy'); setErrorMessage(''); setSelectedPackage(null); }} style={{ flex: 1, padding: '10px', background: 'none', border: 'none', borderBottom: activeTab === 'buy' ? '2px solid var(--primary)' : 'none', fontWeight: activeTab === 'buy' ? 'bold' : 'normal', color: activeTab === 'buy' ? 'var(--primary)' : 'var(--gray)', cursor: 'pointer', marginBottom: '-2px' }}>Buy WiFi</button>
          <button onClick={() => { setActiveTab('voucher'); setErrorMessage(''); setSelectedPackage(null); }} style={{ flex: 1, padding: '10px', background: 'none', border: 'none', borderBottom: activeTab === 'voucher' ? '2px solid var(--primary)' : 'none', fontWeight: activeTab === 'voucher' ? 'bold' : 'normal', color: activeTab === 'voucher' ? 'var(--primary)' : 'var(--gray)', cursor: 'pointer', marginBottom: '-2px' }}>Have a Voucher?</button>
        </div>

        {activeTab === 'buy' && (
          <div>
            {!selectedPackage ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {hotelInfo?.packages?.length > 0 ? hotelInfo.packages.map(pkg => (
                  <div key={pkg.id} onClick={() => handleBuy(pkg)} style={{ padding: '15px', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 'bold' }}>{pkg.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{formatDuration(pkg.duration_minutes)} at {pkg.speed_down_kbps / 1024} Mbps</div>
                    </div>
                    <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>TZS {pkg.price_tzs.toLocaleString()}</div>
                  </div>
                )) : (
                  <p style={{ color: 'var(--gray)' }}>No packages available at this time.</p>
                )}
              </div>
            ) : (
              <form onSubmit={submitPayment} style={{ textAlign: 'left' }}>
                <div style={{ padding: '15px', backgroundColor: 'var(--light)', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ fontWeight: 'bold' }}>{selectedPackage.name}</div>
                  <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '18px' }}>TZS {selectedPackage.price_tzs.toLocaleString()}</div>
                </div>
                
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>Phone Number</label>
                <input 
                  className="form-control" 
                  type="tel" 
                  placeholder="0712345678" 
                  value={phoneNumber} 
                  onChange={e => setPhoneNumber(e.target.value)} 
                  required 
                  style={{ marginBottom: '15px' }}
                />
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setSelectedPackage(null)} className="btn btn-secondary" style={{ flex: 1 }} disabled={status === 'loading'}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Processing...' : 'Pay Now'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {activeTab === 'voucher' && (
          <form onSubmit={handleRedeem}>
            <p style={{ color: 'var(--gray)', marginBottom: '20px', fontSize: '14px' }}>Enter your voucher code to connect.</p>
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
        )}

        <p style={{ fontSize: '12px', color: 'var(--gray-light)', marginTop: '30px' }}>Powered by OSWAGOTech</p>
      </div>
    </div>
  );
}