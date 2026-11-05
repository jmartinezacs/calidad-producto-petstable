// Service worker de Liberación de producto · Pet's Table
// Habilita la instalación como app y muestra las notificaciones push. No guarda
// caché ni funciona sin conexión: los análisis siempre se leen y guardan en el servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* red directa */ });

const ICONO = '/notif-icon.png';

// Ícono con la foto circular de quien generó el aviso y el ícono de la app en
// pequeño; si algo falla se usa el ícono de la app.
async function iconoConFoto(foto) {
  if (!foto || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return ICONO;
  try {
    if (new URL(foto).protocol !== 'https:') return ICONO;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const [rf, ri] = await Promise.all([fetch(foto, { mode: 'cors', signal: ctl.signal }), fetch(ICONO, { signal: ctl.signal })]);
    clearTimeout(t);
    if (!rf.ok || !ri.ok) return ICONO;
    const [img, ico] = await Promise.all([createImageBitmap(await rf.blob()), createImageBitmap(await ri.blob())]);
    const S = 256, c = new OffscreenCanvas(S, S), g = c.getContext('2d');
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    const k = Math.max(S / img.width, S / img.height), w = img.width * k, h = img.height * k;
    g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h); g.restore();
    const r = 46, cx = S - r - 6, cy = S - r - 6;
    g.beginPath(); g.arc(cx, cy, r + 7, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.drawImage(ico, cx - r, cy - r, r * 2, r * 2); g.restore();
    const b = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(s)}`;
  } catch {
    return ICONO;
  }
}

async function mostrar(d) {
  const opciones = {
    body: d.body || '',
    icon: await iconoConFoto(d.foto),
    // Android pinta la insignia de la barra de estado como silueta: huella blanca con palomita sobre transparente
    badge: '/notif-badge.png',
    tag: d.tag || `brom-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 120, 300],
    timestamp: Date.now(),
    actions: [{ action: 'ver', title: 'Ver ahora' }],
    data: { url: d.url || '/' },
  };
  try {
    await self.registration.showNotification(d.title || 'Liberación de producto', opciones);
  } catch {
    await self.registration.showNotification(d.title || 'Liberación de producto', { ...opciones, icon: ICONO });
  }
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(mostrar(d));
});

// Aviso de prueba local desde Mi perfil (misma apariencia que los avisos reales)
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.tipo !== 'aviso-prueba' || (e.origin && e.origin !== self.location.origin)) return;
  e.waitUntil(mostrar({ title: d.title, body: d.body, foto: d.foto, tag: `prueba-${Date.now()}`, url: '/#/perfil' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) {
        if ('navigate' in c) await c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
