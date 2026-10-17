import React from 'react';

export default function DashboardPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ margin: '5px 0 0 0', color: '#6b7280' }}>Welcome to your WiFi management panel.</p>
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <h3>Your stats will appear here.</h3>
      </div>
    </div>
  );
}