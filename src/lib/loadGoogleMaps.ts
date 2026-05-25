const MAPS_URL = `https://maps.googleapis.com/maps/api/js?key=${
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
}&libraries=marker,places`;

let _promise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return new Promise(() => {});
  if (window.google?.maps) return Promise.resolve();
  if (_promise) return _promise;

  _promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existing) {
      if (window.google?.maps) { resolve(); return; }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps load error")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = MAPS_URL;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps load error")), { once: true });
    document.head.appendChild(script);
  });

  _promise.catch(() => { _promise = null; });
  return _promise;
}
