import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [id, setId] = React.useState('');       // email or username
  const [pw, setPw] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login({ emailOrUsername: id, password: pw });
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 16 }}>
      <h2>Admin Login</h2>
      <form onSubmit={onSubmit}>
        <label style={{ display: 'block', marginTop: 12 }}>Email / Username</label>
        <input className="inp" value={id} onChange={e => setId(e.target.value)} />

        <label style={{ display: 'block', marginTop: 12 }}>Password</label>
        <input className="inp" type="password" value={pw} onChange={e => setPw(e.target.value)} />

        {err && <div style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}

        <button className="btn primary" type="submit" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
