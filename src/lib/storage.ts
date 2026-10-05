const FAVORITES = "azonix.favorites";
const RECENTS = "azonix.recents";
const PIN = "azonix.pin";

export function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function writeFavorites(ids: string[]) {
  localStorage.setItem(FAVORITES, JSON.stringify(ids));
}

export function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(id: string) {
  const next = [id, ...readRecents().filter((item) => item !== id)].slice(0, 40);
  localStorage.setItem(RECENTS, JSON.stringify(next));
  return next;
}

export function readPin() {
  return localStorage.getItem(PIN) ?? "";
}

export function writePin(pin: string) {
  if (pin) localStorage.setItem(PIN, pin);
  else localStorage.removeItem(PIN);
}
