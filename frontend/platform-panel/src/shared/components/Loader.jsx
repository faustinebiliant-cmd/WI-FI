import React from 'react';

export default function Loader({ message = 'Loading...' }) {
  return (
    <div className="loader-container">
      <div className="spinner"></div>
      {message && <p className="loader-text">{message}</p>}
    </div>
  );
}