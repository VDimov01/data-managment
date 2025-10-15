import * as Switch from '@radix-ui/react-switch';
import { useEffect, useMemo, useState } from 'react';
//the css is in the index.css
const THEME_KEY = 'theme'; // 'light' | 'dark' | 'auto'

function applyTheme(mode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const forceDark = mode === 'dark' || (mode === 'auto' && prefersDark);
  root.setAttribute('data-theme', forceDark ? 'dark' : 'light');
  localStorage.setItem(THEME_KEY, mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState(() => localStorage.getItem(THEME_KEY) || 'auto');

  // keep theme applied
  useEffect(() => { applyTheme(mode); }, [mode]);

  // when in auto, react to system changes
  useEffect(() => {
    if (mode !== 'auto') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [mode]);

  // compute what the switch should show
  const prefersDark = useMemo(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    []
  );
  const switchChecked = mode === 'dark' || (mode === 'auto' && prefersDark);

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <label className="switch-label" htmlFor="theme-switch">Тъмен режим</label>

      <Switch.Root
        id="theme-switch"
        className="switch-root"
        checked={switchChecked}
        disabled={mode === 'auto'}
        onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
      >
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>

      <button
        type="button"
        className={'btn btn-ghost small' + (mode === 'auto' ? ' btn-active' : '')}
        onClick={() => {
          if (mode === 'auto') {
            // leave auto following current system to a concrete value
            setMode(prefersDark ? 'dark' : 'light');
          } else {
            setMode('auto');
          }
        }}
        title="Follow system appearance"
      >
        Auto
      </button>
    </div>
  );
}
