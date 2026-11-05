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

type Dest = { id: string; correo: string; nombre_completo: string; recibe_correos?: boolean; correos_admin?: boolean };
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

// Tono, ícono y textos según el tipo de aviso
type Tono = 'ok' | 'warn' | 'bad' | 'info';
const TIPOS: Record<string, { tono: Tono; estado: string; boton: string; icono: string; porque: string; lote: string }> = {
  captura_pendiente: { tono: 'warn', estado: 'Captura pendiente', boton: 'Capturar análisis', icono: '&#9998;', porque: 'Tu puesto captura esta área de análisis.', lote: 'En proceso' },
  area_capturada: { tono: 'info', estado: 'Área capturada', boton: 'Ver el lote', icono: '&#10003;', porque: 'Registraste este lote o tu puesto también captura esta área.', lote: 'En proceso' },
  listo_liberar: { tono: 'ok', estado: 'Listo para liberar', boton: 'Liberar el lote', icono: '&#10003;', porque: 'Tu puesto puede liberar lotes y emitir el certificado de calidad.', lote: 'Listo para liberar' },
  no_conforme: { tono: 'bad', estado: 'Lote no conforme', boton: 'Revisar resultados', icono: '!', porque: 'Registraste este lote o tu puesto puede liberar lotes.', lote: 'No conforme' },
  liberado: { tono: 'ok', estado: 'Lote liberado', boton: 'Ver el certificado', icono: '&#10003;', porque: 'Registraste este lote o capturaste algunos de sus análisis.', lote: 'Liberado' },
  prueba: { tono: 'info', estado: 'Correo de prueba', boton: 'Abrir el sistema', icono: 'i', porque: 'Pediste un correo de prueba desde Mi perfil.', lote: 'Listo para liberar' },
};
const TONOS: Record<Tono, { fondo: string; texto: string; fuerte: string }> = {
  ok: { fondo: '#E7F6EC', texto: '#15803D', fuerte: '#16A34A' },
  warn: { fondo: '#FFF4E5', texto: '#B45309', fuerte: '#F59E0B' },
  bad: { fondo: '#FDECEC', texto: '#B91C1C', fuerte: '#DC2626' },
  info: { fondo: '#E6F8F8', texto: '#0E7C7C', fuerte: '#0EA5A8' },
};
const ESTADO_LOTE: Record<string, Tono> = { 'En proceso': 'warn', 'Listo para liberar': 'info', 'No conforme': 'bad', Liberado: 'ok' };

type AreaAv = { nombre: string; color: string; cumple: number; no: number; total: number };
type Info = { lote?: string; receta?: string; recetaColor?: string; fecha?: string; folio?: string; registro?: string; por?: string; areas?: AreaAv[] };

function plantillaCorreo(nombre: string, titulo: string, msg: string, ruta: string, tipo: string, info: Info, logo = `cid:${LOGO_CID}`) {
  const t = TIPOS[tipo] || TIPOS.prueba;
  const k = TONOS[t.tono];
  const font = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const site = SITE();
  const estadoLote = t.lote;
  const ke = TONOS[ESTADO_LOTE[estadoLote] || 'info'];
  // Datos del lote en cuadrícula de dos columnas
  const celdas: [string, string][] = [];
  if (info.lote) celdas.push(['Lote', `<span style="font-family:Consolas,'Courier New',monospace;font-size:18px;font-weight:800;color:#0B2235">${esc(info.lote)}</span>`]);
  if (info.receta) celdas.push(['Receta', `<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${esc(info.recetaColor || '#F58020')};margin-right:7px"></span><b style="color:#0B2235">${esc(info.receta)}</b>`]);
  if (info.fecha) celdas.push(['Fecha del lote', `<b style="color:#0B2235">${esc(info.fecha)}</b>`]);
  celdas.push(['Estado del lote', `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${ke.fondo};color:${ke.texto};font-weight:800;font-size:13px">${esc(estadoLote)}</span>`]);
  if (info.folio) celdas.push(['Folio del certificado', `<span style="font-family:Consolas,'Courier New',monospace;font-weight:800;color:#0B2235">${esc(info.folio)}</span>`]);
  if (info.registro) celdas.push(['Registró', `<b style="color:#0B2235">${esc(info.registro)}</b>`]);
  if (info.por) celdas.push([tipo === 'liberado' ? 'Liberó' : 'Aviso generado por', `<b style="color:#0B2235">${esc(info.por)}</b>`]);
  const filasDatos: string[] = [];
  for (let i = 0; i < celdas.length; i += 2) {
    const c = (x?: [string, string]) => x ? `<td width="50%" valign="top" style="padding:14px 16px;${font}">
        <div style="color:#7A8A97;font-size:12px;font-weight:700;margin-bottom:6px">${esc(x[0])}</div><div style="font-size:15px;color:#33475B">${x[1]}</div></td>` : '<td width="50%"></td>';
    filasDatos.push(`<tr>${c(celdas[i])}${c(celdas[i + 1])}</tr>`);
  }
  // Avance por área con barra de color
  const areas = (info.areas || []).map((a) => {
    const hechos = a.cumple + a.no;
    const pct = a.total ? Math.round((hechos / a.total) * 100) : 0;
    const txt = a.no ? `${a.no} no ${a.no === 1 ? 'cumple' : 'cumplen'}` : hechos === a.total ? 'Todo cumple' : hechos ? 'En proceso' : 'Por capturar';
    const col = a.no ? '#DC2626' : hechos === a.total ? '#16A34A' : '#B45309';
    return `<tr><td style="padding:10px 16px;border-top:1px solid #EEF2F5;${font}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="${font};font-size:14px;font-weight:700;color:#0B2235"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${esc(a.color)};margin-right:8px"></span>${esc(a.nombre)}</td>
          <td align="right" style="${font};font-size:12.5px;font-weight:800;color:${col}">${esc(txt)} · ${hechos}/${a.total}</td></tr>
          <tr><td colspan="2" style="padding-top:8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F5;border-radius:999px"><tr>
            ${pct ? `<td width="${pct}%" style="height:8px;line-height:8px;font-size:0;background:${esc(a.color)};border-radius:999px">&nbsp;</td>` : ''}${pct < 100 ? '<td style="height:8px;line-height:8px;font-size:0">&nbsp;</td>' : ''}</tr></table></td></tr>
        </table></td></tr>`;
  }).join('');
  const enlace = `${site}/${ruta}`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F6;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(msg)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F6"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px">
    <!-- Encabezado -->
    <tr><td style="padding:0 6px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle">${logo
          ? `<img src="${logo}" width="92" alt="Pet's Table" style="display:block;width:92px;height:auto;border:0">`
          : `<span style="${font};color:#F58020;font-size:26px;font-weight:900">pet's table</span>`}</td>
        <td align="right" style="vertical-align:middle;${font}">
          <div style="color:#0B2235;font-size:15px;font-weight:800">Liberación de producto</div>
          <div style="color:#7A8A97;font-size:12px;margin-top:2px">Calidad de producto · Pet's Table</div></td>
      </tr></table></td></tr>
    <tr><td style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 14px 40px rgba(11,34,53,.10)">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <!-- Bloque de estado -->
        <tr><td style="background:#0B2235;background-image:linear-gradient(135deg,#0B2235 0%,#0C4A55 60%,#0C6C74 100%);padding:30px 32px 28px;${font}">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:46px;height:46px;border-radius:23px;background:${k.fuerte};color:#FFFFFF;font-size:22px;font-weight:900;text-align:center;line-height:46px">${t.icono}</td>
            <td style="padding-left:12px"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.14);color:#FFFFFF;font-size:13px;font-weight:800">${esc(t.estado)}</span></td></tr></table>
          <h1 style="margin:18px 0 0;color:#FFFFFF;font-size:26px;line-height:1.25;font-weight:800">${esc(titulo)}</h1>
        </td></tr>
        <tr><td style="height:5px;line-height:5px;font-size:0;background:#F58020;background-image:linear-gradient(90deg,#F58020,#FFB36B 60%,#1BC7C7)">&nbsp;</td></tr>
        <!-- Mensaje -->
        <tr><td style="padding:26px 32px 4px;${font}">
          <p style="margin:0 0 8px;color:#0B2235;font-size:16px;line-height:1.6">Hola <b>${esc(nombre)}</b>,</p>
          <p style="margin:0;color:#4A5B69;font-size:16px;line-height:1.65">${esc(msg)}</p>
        </td></tr>
        ${filasDatos.length ? `<tr><td style="padding:22px 32px 0">
          <div style="${font};color:#0B2235;font-size:13px;font-weight:800;margin:0 0 10px">Datos del lote</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E9EE;border-radius:16px;border-collapse:separate;background:#FAFBFC">${filasDatos.join('')}</table></td></tr>` : ''}
        ${areas ? `<tr><td style="padding:22px 32px 0">
          <div style="${font};color:#0B2235;font-size:13px;font-weight:800;margin:0 0 10px">Avance por área de análisis</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E9EE;border-radius:16px;border-collapse:separate">${areas}</table></td></tr>` : ''}
        <!-- Botón -->
        <tr><td align="center" style="padding:28px 32px 6px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:14px;background:#F58020;background-image:linear-gradient(135deg,#F58020,#FF9A2F);box-shadow:0 8px 18px rgba(245,128,32,.35)">
            <a href="${esc(enlace)}" style="display:inline-block;padding:15px 34px;${font};color:#FFFFFF;font-size:16px;font-weight:800;text-decoration:none;border-radius:14px">${esc(t.boton)} &rarr;</a>
          </td></tr></table>
          <div style="${font};color:#97A6B2;font-size:12px;margin-top:10px">o abre <a href="${esc(enlace)}" style="color:#0C6C74;text-decoration:underline">${esc(site.replace(/^https?:\/\//, ''))}</a></div></td></tr>
        <!-- Por qué recibes este correo -->
        <tr><td style="padding:22px 32px 30px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${k.fondo};border-radius:14px"><tr>
            <td style="width:4px;background:${k.fuerte};border-radius:14px 0 0 14px">&nbsp;</td>
            <td style="padding:12px 16px;${font};color:#4A5B69;font-size:13px;line-height:1.6"><b style="color:${k.texto}">¿Por qué recibes este correo?</b> ${esc(t.porque)}
              Puedes dejar de recibir estos correos en Mi perfil → Notificaciones y correos.</td></tr></table></td></tr>
      </table></td></tr>
    <tr><td align="center" style="padding:22px 12px 0;${font};color:#97A6B2;font-size:12px;line-height:1.6">
      <b style="color:#6B7C8A">Pet's Table S.A. de C.V.</b> · Calidad de producto<br>
      Aviso automático; no respondas a este correo. © ${new Date().getFullYear()} Pet's Table. Uso interno.</td></tr>
  </table>
</td></tr></table></body></html>`;
}

async function enviarCorreo(d: Dest, titulo: string, msg: string, ruta: string, tipo: string, info: Info) {
  if (!d.correo) return false;
  const gmail = await transporteGmail();
  const resend = Deno.env.get('RESEND_API_KEY');
  if (!gmail && !resend) return false;
  const logo = await logoB64();
  const html = plantillaCorreo(d.nombre_completo, titulo, msg, ruta, tipo, info, logo ? `cid:${LOGO_CID}` : '');
  const texto = [`Hola ${d.nombre_completo},`, msg, info.lote ? `Lote: ${info.lote}` : '', info.receta ? `Receta: ${info.receta}` : '', info.fecha ? `Fecha del lote: ${info.fecha}` : '',
    info.folio ? `Folio del certificado: ${info.folio}` : '', ...(info.areas || []).map((a) => `${a.nombre}: ${a.cumple + a.no} de ${a.total} capturados${a.no ? `, ${a.no} no cumplen` : ''}`),
    `${SITE()}/${ruta}`].filter(Boolean).join('\n');
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

const fechaLarga = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '');

// Datos de los lotes para los correos: receta, fecha, folio, quién registró y avance por área
// deno-lint-ignore no-explicit-any
async function datosLotes(admin: any, ids: string[]) {
  const out = new Map<string, Info & { _lote: string }>();
  if (!ids.length) return out;
  const [{ data: lotes }, { data: mets }, { data: areas }] = await Promise.all([
    admin.from('brom_muestras').select('id, lote, receta_id, fecha_analisis, folio_certificado, liberado_por_nombre, usuario_id, brom_recetas(nombre_receta, color), brom_resultados_analisis(metodo_id, cumple, resultado, resultado_texto)').in('id', ids),
    admin.from('brom_catalogo_metodos').select('id, area, activo, recetas_aplica'),
    admin.from('brom_areas_analisis').select('id, nombre, color, orden, activa').order('orden'),
  ]);
  const usuarios = [...new Set((lotes || []).map((l: { usuario_id: string }) => l.usuario_id).filter(Boolean))];
  const { data: regs } = usuarios.length ? await admin.from('brom_usuarios').select('id, nombre_completo').in('id', usuarios) : { data: [] };
  const nombre = new Map((regs || []).map((u: { id: string; nombre_completo: string }) => [u.id, u.nombre_completo]));
  // deno-lint-ignore no-explicit-any
  for (const l of (lotes || []) as any[]) {
    const req = (mets || []).filter((m: { activo: boolean; recetas_aplica: string[] | null }) => m.activo && (!m.recetas_aplica || m.recetas_aplica.includes(l.receta_id)));
    const av: AreaAv[] = [];
    for (const a of (areas || []).filter((x: { activa: boolean }) => x.activa)) {
      const ms = req.filter((m: { area: string }) => m.area === a.id).map((m: { id: string }) => m.id);
      if (!ms.length) continue;
      // deno-lint-ignore no-explicit-any
      const rs = (l.brom_resultados_analisis || []).filter((r: any) => ms.includes(r.metodo_id) && (r.resultado !== null || r.resultado_texto !== null || r.cumple !== null));
      // deno-lint-ignore no-explicit-any
      av.push({ nombre: a.nombre, color: a.color, total: ms.length, cumple: rs.filter((r: any) => r.cumple !== false).length, no: rs.filter((r: any) => r.cumple === false).length });
    }
    out.set(l.id, { _lote: l.lote, lote: l.lote, receta: l.brom_recetas?.nombre_receta, recetaColor: l.brom_recetas?.color, fecha: fechaLarga(l.fecha_analisis),
      folio: l.folio_certificado || undefined, registro: nombre.get(l.usuario_id) as string | undefined, areas: av });
  }
  return out;
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
      const titulo = '[Prueba] Lote 031126 listo para liberar';
      const msg = 'Todos los análisis del lote 031126 de Meat Festival cumplen. Ya puedes liberarlo y emitir su certificado de calidad.';
      const det: Info = { lote: '031126', receta: 'Meat Festival', recetaColor: '#F58020', fecha: fechaLarga(new Date().toISOString()), registro: nombreYo, por: nombreYo,
        areas: [{ nombre: 'Bromatológico', color: '#9333EA', cumple: 3, no: 0, total: 3 }, { nombre: 'Fisicoquímico', color: '#2563EB', cumple: 2, no: 0, total: 2 },
          { nombre: 'Microbiológico', color: '#DB2777', cumple: 4, no: 0, total: 4 }, { nombre: 'Sensorial', color: '#CA8A04', cumple: 4, no: 0, total: 4 }] };
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
    const { data: dest } = await admin.from('brom_usuarios').select('id, correo, nombre_completo, recibe_correos, correos_admin, activo').in('id', usuarios);
    const porId = new Map((dest || []).filter((d: Dest & { activo: boolean }) => d.activo).map((d: Dest) => [d.id, d]));
    const muestras = [...new Set(avisos.map((a: Aviso) => a.muestra_id).filter(Boolean))];
    const lotePor = await datosLotes(admin, muestras as string[]);

    let push = 0, correo = 0;
    for (const a of avisos as Aviso[]) {
      const d = porId.get(a.usuario_id) as Dest | undefined;
      if (!d) continue;
      const l = a.muestra_id ? lotePor.get(a.muestra_id) : undefined;
      const ruta = l ? `#/lotes?q=${encodeURIComponent(l._lote)}` : '#/lotes';
      push += await enviarPush(admin, d.id, { title: a.titulo, body: a.mensaje, url: `/${ruta}`, tag: `${a.muestra_id || 'brom'}-${a.tipo}-${a.area || ''}`, foto });
      // Correo: solo si la persona lo quiere y el administrador no lo desactivó
      if (d.recibe_correos !== false && d.correos_admin !== false) {
        const det: Info = l ? { ...l, folio: a.tipo === 'liberado' ? l.folio : undefined, por: nombreYo } : { por: nombreYo };
        if (await enviarCorreo(d, a.titulo, a.mensaje, ruta, a.tipo, det)) correo++;
      }
    }
    return json(200, { ok: true, avisos: avisos.length, push, correo });
  } catch (e) {
    console.error('notificar_brom', e);
    return json(500, { error: 'No se pudieron enviar los avisos.' });
  }
});
