// Edge Function: notificar_brom
// Envía por notificación push (Web Push) y por correo los avisos de Liberación
// de producto. Los avisos se generan en la base de datos (brom_generar_avisos)
// al registrar un lote, capturar análisis o liberarlo; el sitio llama a esta
// función justo después de guardar y aquí se envían los avisos pendientes que
// generó quien guardó.
//
// Acciones:
//   init           → crea las claves VAPID la primera vez y devuelve la pública
//   enviar         → envía los avisos pendientes generados por quien llama
//   prueba         → crea un aviso de prueba para quien llama y lo envía por push
//   correo_prueba  → vista previa (vista=true) o envío de un correo de prueba a quien llama
//
// Secretos del proyecto (los mismos de Servicio médico):
//   GMAIL_USER / GMAIL_APP_PASSWORD → cuenta de Google Workspace que envía (contraseña de aplicación)
//   RESEND_API_KEY / BROM_EMAIL_FROM → alternativa con Resend
//   BROM_SITE_URL → dirección del sitio (por omisión https://calidad-producto-petstable.vercel.app)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const b64u = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SITE = () => (Deno.env.get('BROM_SITE_URL') || 'https://calidad-producto-petstable.vercel.app').replace(/\/$/, '');

type Dest = { id: string; correo: string; nombre_completo: string; recibe_correos?: boolean };
type Aviso = { id: string; usuario_id: string; tipo: string; titulo: string; mensaje: string; muestra_id: string | null; area: string | null };

// deno-lint-ignore no-explicit-any
async function asegurarClaves(admin: any) {
  const r = await admin.rpc('brom_vapid_claves');
  if (r.data?.[0]) return r.data[0];
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const g = await admin.rpc('brom_vapid_guardar', { p_publica: pub, p_privada: jwk.d });
  if (g.error) throw g.error;
  return (await admin.rpc('brom_vapid_claves')).data[0];
}

// Push a todos los dispositivos de una persona
// deno-lint-ignore no-explicit-any
async function enviarPush(admin: any, usuarioId: string, payload: Record<string, unknown>) {
  const { data: subs } = await admin.from('brom_push_subs').select('id, endpoint, p256dh, auth').eq('usuario_id', usuarioId);
  if (!subs?.length) return 0;
  const k = await asegurarClaves(admin);
  webpush.setVapidDetails(k.contacto, k.vapid_publica, k.vapid_privada);
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('brom_push_subs').delete().eq('id', s.id);
      else console.error('push', code, (e as Error).message);
    }
  }
  return n;
}

// ---------- Correo ----------
let smtp: { sendMail: (o: Record<string, unknown>) => Promise<unknown> } | null = null;
async function transporteGmail() {
  const user = Deno.env.get('GMAIL_USER'), pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) return null;
  if (!smtp) {
    const nodemailer = (await import('npm:nodemailer@6.9.16')).default;
    smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: pass.replace(/\s+/g, '') } });
  }
  return { t: smtp!, user };
}
const correoConfigurado = () => !!(Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')) || !!Deno.env.get('RESEND_API_KEY');

const LOGO_CID = 'logo-petstable';
let logoCache: string | null | undefined;
async function logoB64() {
  if (logoCache !== undefined) return logoCache;
  logoCache = null;
  try {
    const r = await fetch(`${SITE()}/logo-correo.png`);
    if (r.ok && (r.headers.get('content-type') || '').includes('image/png')) {
      const b = new Uint8Array(await r.arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      logoCache = btoa(s);
    }
  } catch (e) { console.error('logo', (e as Error).message); }
  return logoCache;
}

// Tono y textos según el tipo de aviso
const TIPOS: Record<string, { tono: 'ok' | 'warn' | 'bad' | 'info'; estado: string; boton: string }> = {
  captura_pendiente: { tono: 'warn', estado: 'Captura pendiente', boton: 'Capturar análisis' },
  area_capturada: { tono: 'info', estado: 'Área capturada', boton: 'Ver el lote' },
  listo_liberar: { tono: 'ok', estado: 'Listo para liberar', boton: 'Liberar el lote' },
  no_conforme: { tono: 'bad', estado: 'Lote no conforme', boton: 'Ver resultados' },
  liberado: { tono: 'ok', estado: 'Lote liberado', boton: 'Ver el certificado' },
  prueba: { tono: 'info', estado: 'Aviso de prueba', boton: 'Abrir el sistema' },
};

type Detalle = [string, string];
function plantillaCorreo(nombre: string, titulo: string, msg: string, ruta: string, tipo: string, detalles: Detalle[], logo = `cid:${LOGO_CID}`) {
  const t = TIPOS[tipo] || TIPOS.prueba;
  const tonos = { ok: ['#E7F6EC', '#15803D', '#16A34A'], warn: ['#FFF4E5', '#B45309', '#F59E0B'], bad: ['#FDECEC', '#B91C1C', '#DC2626'], info: ['#E6F8F8', '#0E7C7C', '#1BC7C7'] };
  const [, color, fuerte] = tonos[t.tono];
  const font = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const filas = detalles.map(([k, v], i) => `
          <tr>
            <td style="padding:12px 16px;${i ? 'border-top:1px solid #EDF1F4;' : ''}${font};color:#6B7C8A;font-size:13px;font-weight:700;width:38%;vertical-align:top">${esc(k)}</td>
            <td style="padding:12px 16px;${i ? 'border-top:1px solid #EDF1F4;' : ''}${font};color:#0B2235;font-size:15px;font-weight:600;vertical-align:top">${esc(v)}</td>
          </tr>`).join('');
  const site = SITE();
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#F1F4F7;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(msg)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F7"><tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="padding:0 4px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle">${logo
          ? `<img src="${logo}" width="96" alt="Pet's Table" style="display:block;width:96px;height:auto;border:0">`
          : `<span style="${font};color:#F58020;font-size:26px;font-weight:900;letter-spacing:-.5px">pet's table</span>`}</td>
        <td align="right" style="vertical-align:middle;${font}">
          <div style="color:#0B2235;font-size:15px;font-weight:800">Liberación de producto</div>
          <div style="color:#6B7C8A;font-size:12px;margin-top:2px">Calidad de producto</div></td>
      </tr></table></td></tr>
    <tr><td style="background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(11,34,53,.08)">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:6px;line-height:6px;font-size:0;background:#0C6C74">&nbsp;</td><td style="height:6px;width:30%;line-height:6px;font-size:0;background:#F58020">&nbsp;</td></tr>
        <tr><td colspan="2" style="padding:34px 32px 6px;${font}">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:30px;height:30px;border-radius:15px;background:${fuerte};color:#FFFFFF;font-size:17px;font-weight:800;text-align:center;line-height:30px">${t.tono === 'ok' ? '&#10003;' : t.tono === 'info' ? 'i' : '!'}</td>
            <td style="padding-left:10px;color:${color};font-size:14px;font-weight:800">${esc(t.estado)}</td></tr></table>
          <h1 style="margin:18px 0 10px;color:#0B2235;font-size:25px;line-height:1.25;font-weight:800">${esc(titulo)}</h1>
          <p style="margin:0 0 6px;color:#0B2235;font-size:16px;line-height:1.6">Hola <b>${esc(nombre)}</b>,</p>
          <p style="margin:0;color:#4A5B69;font-size:16px;line-height:1.6">${esc(msg)}</p>
        </td></tr>
        ${filas ? `<tr><td colspan="2" style="padding:22px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E9EE;border-radius:14px;border-collapse:separate">${filas}
          </table></td></tr>` : ''}
        <tr><td colspan="2" style="padding:28px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#F58020">
            <a href="${esc(site)}/${esc(ruta)}" style="display:inline-block;padding:14px 26px;${font};color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px">${esc(t.boton)} &rarr;</a>
          </td></tr></table></td></tr>
        <tr><td colspan="2" style="padding:32px 32px 30px;${font}">
          <div style="border-top:1px solid #EDF1F4;padding-top:18px;color:#8494A1;font-size:12.5px;line-height:1.6">
            Aviso automático de Liberación de producto. Puedes dejar de recibir estos correos en Mi perfil → Notificaciones.</div></td></tr>
      </table></td></tr>
    <tr><td align="center" style="padding:22px 12px 0;${font};color:#97A6B2;font-size:12px;line-height:1.6">
      <b style="color:#6B7C8A">Pet's Table S.A. de C.V.</b> · Calidad de producto<br>
      © ${new Date().getFullYear()} Pet's Table. Uso interno.</td></tr>
  </table>
</td></tr></table></body></html>`;
}

async function enviarCorreo(d: Dest, titulo: string, msg: string, ruta: string, tipo: string, detalles: Detalle[]) {
  if (!d.correo) return false;
  const gmail = await transporteGmail();
  const resend = Deno.env.get('RESEND_API_KEY');
  if (!gmail && !resend) return false;
  const logo = await logoB64();
  const html = plantillaCorreo(d.nombre_completo, titulo, msg, ruta, tipo, detalles, logo ? `cid:${LOGO_CID}` : '');
  const texto = [`Hola ${d.nombre_completo},`, msg, ...detalles.map(([k, v]) => `${k}: ${v}`), `${SITE()}/${ruta}`].join('\n');
  try {
    if (gmail) {
      await gmail.t.sendMail({ from: `"Liberación de producto · Pet's Table" <${gmail.user}>`, to: d.correo, subject: titulo, text: texto, html,
        attachments: logo ? [{ filename: 'petstable.png', content: logo, encoding: 'base64', cid: LOGO_CID, contentDisposition: 'inline' }] : [] });
      return true;
    }
    const from = Deno.env.get('BROM_EMAIL_FROM') || 'Liberación de producto <onboarding@resend.dev>';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [d.correo], subject: titulo, html, text: texto,
        ...(logo ? { attachments: [{ filename: 'petstable.png', content: logo, content_id: LOGO_CID }] } : {}) }),
    });
    if (!r.ok) console.error('correo', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('correo', (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: perfil, error: pErr } = await caller.rpc('brom_usuario_actual_perfil');
    const yo = perfil?.[0];
    if (pErr || !yo || !yo.activo) return json(403, { error: 'Usuario no autorizado.' });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const foto = typeof yo.foto_url === 'string' && yo.foto_url.startsWith(`${url}/storage/v1/object/public/`) ? yo.foto_url : null;
    const nombreYo = yo.nombre_completo || yo.correo;

    if (body.accion === 'init') {
      const k = await asegurarClaves(admin);
      return json(200, { publica: k.vapid_publica });
    }

    // Aviso de prueba: queda en la campana y llega por push a los dispositivos de quien lo pide
    if (body.accion === 'prueba') {
      const titulo = 'Aviso de prueba · Liberación de producto';
      const msg = 'Así llegarán los avisos de lotes por capturar, áreas capturadas y lotes listos para liberar.';
      const ins = await admin.from('brom_notificaciones').insert({
        usuario_id: yo.id, tipo: 'prueba', titulo, mensaje: msg, clave: `prueba:${Date.now()}`, actor_id: yo.id, actor_nombre: nombreYo, enviada: true,
      });
      if (ins.error) throw ins.error;
      const push = await enviarPush(admin, yo.id, { title: titulo, body: msg, url: '/#/perfil', tag: `prueba-${Date.now()}`, foto });
      return json(200, { ok: true, push });
    }

    // Correo de prueba: vista previa o envío solo al correo de quien lo pide
    if (body.accion === 'correo_prueba') {
      const titulo = '[Prueba] Lote 2611-04 listo para liberar';
      const msg = 'Todos los análisis del lote 2611-04 de Meat Festival cumplen. Ya puedes liberarlo y emitir su certificado.';
      const det: Detalle[] = [['Lote', '2611-04'], ['Receta', 'Meat Festival · Perro'], ['Análisis', '13 de 13 cumplen'], ['Capturó', nombreYo]];
      if (body.vista) {
        return json(200, { html: plantillaCorreo(nombreYo, titulo, msg, '#/lotes', 'listo_liberar', det, '__LOGO__'), configurado: correoConfigurado(), asunto: titulo });
      }
      if (!correoConfigurado()) return json(200, { ok: false, configurado: false });
      const ok = await enviarCorreo({ id: yo.id, correo: yo.correo, nombre_completo: nombreYo }, titulo, msg, '#/lotes', 'listo_liberar', det);
      return json(200, { ok, configurado: true, para: yo.correo });
    }

    if (body.accion !== 'enviar') return json(400, { error: 'Acción no válida.' });

    // Avisos pendientes de envío que generó quien llama (últimos 15 minutos)
    const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: avisos, error: aErr } = await admin.from('brom_notificaciones')
      .select('id, usuario_id, tipo, titulo, mensaje, muestra_id, area')
      .eq('actor_id', yo.id).eq('enviada', false).gte('created_at', desde).order('created_at').limit(200);
    if (aErr) throw aErr;
    if (!avisos?.length) return json(200, { ok: true, push: 0, correo: 0 });
    // Se marcan antes de enviar para que dos llamadas seguidas no los dupliquen
    const ids = avisos.map((a: Aviso) => a.id);
    await admin.from('brom_notificaciones').update({ enviada: true }).in('id', ids);

    const usuarios = [...new Set(avisos.map((a: Aviso) => a.usuario_id))];
    const { data: dest } = await admin.from('brom_usuarios').select('id, correo, nombre_completo, recibe_correos, activo').in('id', usuarios);
    const porId = new Map((dest || []).filter((d: Dest & { activo: boolean }) => d.activo).map((d: Dest) => [d.id, d]));
    const muestras = [...new Set(avisos.map((a: Aviso) => a.muestra_id).filter(Boolean))];
    const { data: lotes } = muestras.length
      ? await admin.from('brom_muestras').select('id, lote, folio_certificado, brom_recetas(nombre_receta, especie)').in('id', muestras)
      : { data: [] };
    const lotePor = new Map((lotes || []).map((l: { id: string }) => [l.id, l]));

    let push = 0, correo = 0;
    for (const a of avisos as Aviso[]) {
      const d = porId.get(a.usuario_id) as Dest | undefined;
      if (!d) continue;
      // deno-lint-ignore no-explicit-any
      const l: any = a.muestra_id ? lotePor.get(a.muestra_id) : null;
      const ruta = l ? `#/lotes?q=${encodeURIComponent(l.lote)}` : '#/lotes';
      push += await enviarPush(admin, d.id, { title: a.titulo, body: a.mensaje, url: `/${ruta}`, tag: `${a.muestra_id || 'brom'}-${a.tipo}-${a.area || ''}`, foto });
      if (d.recibe_correos !== false) {
        const det: Detalle[] = l ? [['Lote', l.lote], ['Receta', [l.brom_recetas?.nombre_receta, l.brom_recetas?.especie].filter(Boolean).join(' · ') || '—'],
          ...(l.folio_certificado && a.tipo === 'liberado' ? [['Folio del certificado', l.folio_certificado] as Detalle] : []), ['Aviso de', nombreYo]] : [];
        if (await enviarCorreo(d, a.titulo, a.mensaje, ruta, a.tipo, det)) correo++;
      }
    }
    return json(200, { ok: true, avisos: avisos.length, push, correo });
  } catch (e) {
    console.error('notificar_brom', e);
    return json(500, { error: 'No se pudieron enviar los avisos.' });
  }
});
