import React from 'react';
export default function Icon({ name, ...props }) {
  const shapes = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
    home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
    clients: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 4v2"/></>,
    money: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 15h4M16 14v2"/></>,
    report: <><path d="M5 3h10l4 4v14H5ZM14 3v5h5M9 17v-3M12 17v-6M15 17v-4"/></>,
    table: <><rect x="3" y="7" width="18" height="5" rx="1"/><path d="M5 12v8M19 12v8M8 3v4M16 3v4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6"/></>,
    box: <><path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8M7 5l10 6"/></>,
    exit: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h13"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name]}</svg>;
}
