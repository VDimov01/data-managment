import * as Select from '@radix-ui/react-select';
import { useEffect } from 'react';

/* Helper: dropdown with a “Create new…” option that reveals an input */
export default function SelectOrCreate({
  label,
  options,
  value,
  setValue,

  // Creation controls
  showCreate = true,
  allowClear = true,

  // Only needed when showCreate=true
  mode = 'existing',          // 'existing' | 'new' | 'none'
  setMode = () => {},
  newValue = '',
  setNewValue = () => {},

  disabled = false,
  inputType = 'text',
  inputPlaceholder = '',
}) {
  const NEW = '__new__';
  const CLEAR = '__clear__';

  // If create is hidden but parent left mode='new', force back to existing
  // useEffect(() => {
  //   if (!showCreate && mode === 'new') setMode('existing');
  // }, [showCreate, mode, setMode]);

  const effectiveMode = showCreate ? mode : 'existing';

  // 🔧 Only 'new' maps to the NEW sentinel; 'none' behaves like empty existing
  const current = effectiveMode === 'new' ? NEW : (value ?? undefined);

  return (
    <div className="sel-field">
      <label className="sel-label">{label}</label>

      <Select.Root
        disabled={disabled}
        value={current}
        onValueChange={(v) => {
          if (v === NEW) {
            if (!showCreate) return;
            setMode('new');
            setValue('');
            return;
          }
          if (v === CLEAR) {
            setMode('none');      // ← clear to 'none', not 'existing'
            setValue('');
            return;
          }
          setMode('existing');
          setValue(v);
        }}
      >
        <Select.Trigger className="sel-trigger">
          <Select.Value placeholder={`${label}…`} />
          <Select.Icon className="sel-caret">▾</Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className="sel-content" position="popper" sideOffset={6}>
            <Select.Viewport className="sel-viewport">
              {options?.map((o) => (
                <Select.Item key={String(o.value)} value={String(o.value)} className="sel-item">
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="sel-check">✓</Select.ItemIndicator>
                </Select.Item>
              ))}

              {(showCreate || allowClear) && <Select.Separator className="sel-sep" />}

              {showCreate && (
                <Select.Item value={NEW} className="sel-item sel-action">
                  ➕ Create new…
                </Select.Item>
              )}

              {allowClear && (
                <Select.Item value={CLEAR} className="sel-item sel-action">
                  Clear selection
                </Select.Item>
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {showCreate && effectiveMode === 'new' && (
        <input
          type={inputType}
          placeholder={inputPlaceholder || `Ново ${label}`}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="sel-input"
        />
      )}
    </div>
  );
}
