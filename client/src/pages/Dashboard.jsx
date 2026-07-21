import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard">
      <header>
        <h1>Loan OS</h1>
        <button onClick={logout}>Sign out</button>
      </header>
      <p>Welcome, {user?.name || user?.email}.</p>
    </div>
  );
}
