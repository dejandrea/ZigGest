export function isPublicSupabaseKey(key) {
  if (!key) return false;
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  try {
    const body = key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(body)).role === 'anon';
  } catch { return false; }
}
