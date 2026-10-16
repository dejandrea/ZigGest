import React, { useEffect, useRef } from 'react';

export function formatMoneyInput(value, decimalPlaces = 2) {
  if (value === '' || value == null) return '';
  const text = (typeof value === 'number' ? value.toLocaleString('en-US', {useGrouping:false,maximumFractionDigits:20}) : String(value)).replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return '';
  const [whole, fraction = ''] = text.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction.replace(/0+$/, '').padEnd(decimalPlaces, '0');
}

export function moneyFromDigits(text, allowNegative = false, decimalPlaces = 2) {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const padded = digits.padStart(decimalPlaces + 1, '0');
  return (allowNegative && text.startsWith('-') ? '-' : '') + padded.slice(0, -decimalPlaces) + '.' + padded.slice(-decimalPlaces);
}

// State and API payloads keep decimal-point values; only the input is localized.
export default function MoneyInput({ value, onChange, onKeyDown, min, max, step, type,
  allowNegative = false, decimalPlaces = 2, placeholder = '0,' + '0'.repeat(decimalPlaces), ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    let message = '';
    if (value !== '' && value != null && !props.readOnly) {
      const amount = Number(String(value).replace(',', '.'));
      if (!Number.isFinite(amount)) message = 'Informe um valor válido.';
      else if (min != null && amount < Number(min)) message = 'O valor deve ser maior ou igual a ' + formatMoneyInput(min) + '.';
      else if (max != null && amount > Number(max)) message = 'O valor deve ser menor ou igual a ' + formatMoneyInput(max) + '.';
    }
    input.setCustomValidity(message);
  }, [value, min, max, props.readOnly]);
  function notify(event, raw) {
    onChange?.({ ...event, target: { ...event.target, name: props.name, id: props.id, value: raw } });
    requestAnimationFrame(() => {
      const input = ref.current;
      if (input && document.activeElement === input) input.setSelectionRange(input.value.length, input.value.length);
    });
  }
  function keyDown(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented || props.readOnly || props.disabled) return;
    if (allowNegative && event.key === '-') {
      event.preventDefault();
      notify(event, String(value).startsWith('-') ? String(value).slice(1) : '-' + (value || '0.00'));
    }
  }
  function paste(event) {
    if (props.readOnly || props.disabled) return;
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
    const decimal = pasted.includes(',') ? pasted.replace(/\./g, '').replace(',', '.') : pasted;
    if (/^-?\d+(\.\d+)?$/.test(decimal) && (allowNegative || !decimal.startsWith('-'))) {
      notify(event, decimal);
    }
  }
  return <input {...props} ref={ref} type="text" inputMode="decimal" placeholder={placeholder}
    value={formatMoneyInput(value, decimalPlaces)} onChange={event => notify(event, moneyFromDigits(event.target.value, allowNegative, decimalPlaces))}
    onKeyDown={keyDown} onPaste={paste}/>;
}
