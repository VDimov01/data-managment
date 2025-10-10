import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';


export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [id, setId] = React.useState(''); // email or username
  const [pw, setPw] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
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
    <main className="auth-wrap">
      <div className="auth-card">
        <header className="auth-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Админ</span>
          </div>
          <h1 className="auth-title">Вписване</h1>
          <p className="auth-subtitle">Достъпи админския панел</p>
        </header>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="id" className="label">Email or username</label>
            <input
              id="id"
              className="input"
              type="text"
              inputMode="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="pw" className="label">Password</label>
            <div className="input with-addon">
              <input
                id="pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="addon"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {err && (
            <div className="alert" role="alert">
              {err}
            </div>
          )}

          <button className="btn primary w-full" type="submit" disabled={busy || !id || !pw}>
            {busy ? (
              <span className="btn-inner">
                <span className="spinner" aria-hidden="true" />
                Вписване…
              </span>
            ) : (
              'Вписване'
            )}
          </button>
        </form>

        <footer className="auth-footer">
          <span className="muted">Забравена парола?</span>
          {/* hook this up later if you add a flow */}
        </footer>
      </div>
    </main>
  );
}
