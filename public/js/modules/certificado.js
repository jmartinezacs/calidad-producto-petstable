// =====================================================================
// Certificado de calidad (PDF tamaño carta) de un lote liberado.
// Diseño ejecutivo: encabezado verde azulado con el logotipo naranja,
// datos del producto, resultados por área (textos centrados), dictamen y
// firmas del Jefe de calidad y del Inspector de calidad elegidos al liberar.
// Se genera en el navegador con jsPDF.
// =====================================================================
import { toast, fmtDate, fechaLote, refLabel, resultadoTxt, criterio, TZ, APP_VERSION } from '../core.js';
import { LOGO, cargarJsPDF, pdfTxt, RGB, hexRGB, logoNaranja } from './pdf.js';

const fechaLarga = (iso) => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
const fechaHora = (ts) => new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
// Verde azulado institucional (no azul marino) y su tono claro
const TEAL = [12, 108, 116], TEAL2 = [17, 138, 146], TEAL_SOFT = [230, 244, 245], GRAFITO = [33, 41, 50];

export async function generarCertificado(lote, resultados, cat) {
  if (!lote.liberado_en || !lote.folio_certificado) { toast('El certificado se emite cuando el lote está liberado.', 'warning'); return; }
  const [jsPDF, logo] = await Promise.all([cargarJsPDF(), logoNaranja()]);
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const W = 215.9, H = 279.4, M = 16, CW = W - 2 * M;
  const receta = cat.recetas.find((r) => r.id === lote.receta_id);
  const colorReceta = hexRGB(receta?.color);
  const f = (estilo, size) => { doc.setFont('helvetica', estilo); doc.setFontSize(size); };
  const c = (rgb, tipo = 'text') => { if (tipo === 'text') doc.setTextColor(...rgb); else if (tipo === 'fill') doc.setFillColor(...rgb); else doc.setDrawColor(...rgb); };
  const centro = (txt, x, yy, max) => doc.text(pdfTxt(txt), x, yy, { align: 'center', ...(max ? { maxWidth: max } : {}) });
  let y = 0;

  // ---- Encabezado: banda verde azulada con el logotipo naranja sobre una tarjeta blanca ----
  c(TEAL, 'fill'); doc.rect(0, 0, W, 38, 'F');
  c(TEAL2, 'fill'); doc.triangle(W * 0.58, 0, W, 0, W, 38, 'F');
  c(RGB.orange, 'fill'); doc.rect(0, 38, W, 1.6, 'F');
  doc.setFillColor(255, 255, 255); doc.roundedRect(M, 6, 38, 26, 3, 3, 'F');
  if (logo) { const lw = 30, lh = Math.min(22, lw * logo.ratio); doc.addImage(logo.data, 'PNG', M + 19 - (lh / logo.ratio) / 2, 19 - lh / 2, lh / logo.ratio, lh, 'logoN', 'FAST'); }
  else { c(RGB.orange, 'fill'); doc.roundedRect(M, 6, 38, 26, 3, 3, 'F'); doc.addImage(LOGO, 'PNG', M + 5.5, 8.2, 27, 21.6, 'logo', 'FAST'); }
  f('bold', 8); doc.setTextColor(255, 214, 170); doc.text('CALIDAD DE PRODUCTO', M + 45, 14, { charSpace: 0.8 });
  f('bold', 21); doc.setTextColor(255, 255, 255); doc.text('Certificado de calidad', M + 45, 23.5);
  f('normal', 8.6); doc.setTextColor(214, 236, 238); doc.text(pdfTxt("Liberación de producto terminado · Pet's Table S.A. de C.V."), M + 45, 29.5);
  // Folio
  doc.setFillColor(255, 255, 255); doc.setGState?.(new doc.GState({ opacity: 0.14 })); doc.roundedRect(W - M - 52, 8, 52, 22, 3, 3, 'F'); doc.setGState?.(new doc.GState({ opacity: 1 }));
  f('normal', 7.4); doc.setTextColor(214, 236, 238); centro('Folio del certificado', W - M - 26, 13.5);
  f('bold', 13.5); doc.setTextColor(255, 255, 255); centro(lote.folio_certificado, W - M - 26, 20.5);
  f('normal', 6.9); doc.setTextColor(214, 236, 238); centro(`Emitido el ${fechaHora(lote.liberado_en)}`, W - M - 26, 26.2);
  y = 46;

  // ---- Datos del producto (centrados) ----
  const datos = [
    ['Producto', receta?.nombre_receta || '—'], ['Código de receta', receta?.codigo || '—'], ['Especie', receta?.especie || '—'],
    ['Número de lote', lote.lote], ['Fecha del lote', fechaLarga(fechaLote(lote.fecha_analisis))], ['Fecha de liberación', fechaLarga(fechaLote(lote.liberado_en))],
  ];
  c(RGB.bg, 'fill'); c(RGB.line, 'draw'); doc.setLineWidth(0.25); doc.roundedRect(M, y, CW, 27, 3, 3, 'FD');
  c(colorReceta, 'fill'); doc.roundedRect(M, y, CW, 1.6, 0.8, 0.8, 'F');
  c(RGB.line, 'draw'); doc.setLineWidth(0.2);
  doc.line(M + CW / 3, y + 5, M + CW / 3, y + 24); doc.line(M + (2 * CW) / 3, y + 5, M + (2 * CW) / 3, y + 24); doc.line(M + 6, y + 14.6, W - M - 6, y + 14.6);
  datos.forEach(([k, v], i) => {
    const col = i % 3, fila = Math.floor(i / 3);
    const x = M + CW / 6 + col * (CW / 3), yy = y + 7.4 + fila * 10.4;
    f('normal', 7); c(RGB.muted); centro(k, x, yy);
    f('bold', 10); c(GRAFITO); centro(v, x, yy + 4.6, CW / 3 - 8);
  });
  y += 33;

  // ---- Resultados por área (una tabla; textos centrados) ----
  const porMetodo = new Map(resultados.map((r) => [r.metodo_id, r]));
  const anchos = [50, 58, 40, CW - 148];
  const centros = anchos.map((_, i) => M + anchos.slice(0, i).reduce((s, n) => s + n, 0) + anchos[i] / 2);
  const filaH = 6;
  const cabecera = () => {
    c(TEAL, 'fill'); doc.roundedRect(M, y, CW, 7, 1.6, 1.6, 'F');
    f('bold', 7.6); doc.setTextColor(255, 255, 255);
    ['Método', 'Especificación', 'Resultado', 'Dictamen'].forEach((t, i) => centro(t, centros[i], y + 4.7));
    y += 8;
  };
  const salto = (h) => { if (y + h > H - 22) { doc.addPage(); y = 18; cabecera(); } };
  f('bold', 10.5); c(GRAFITO); doc.text('Resultados de los análisis', M, y); y += 3;
  cabecera();
  let n = 0;
  cat.areas.forEach((a) => {
    const filas = cat.metodos.filter((m) => m.area === a.id && porMetodo.has(m.id));
    if (!filas.length) return;
    salto(6 + filaH * 2);
    const rgb = hexRGB(a.color);
    doc.setFillColor(...rgb.map((v) => Math.round(v + (255 - v) * 0.88))); doc.rect(M, y, CW, 5.8, 'F');
    f('bold', 8.2); c(rgb); centro(`Análisis ${a.nombre.toLowerCase()} · ${filas.length} ${filas.length === 1 ? 'método' : 'métodos'}`, M + CW / 2, y + 4);
    y += 5.8;
    filas.forEach((m0) => {
      salto(filaH);
      const r = porMetodo.get(m0.id);
      const m = criterio(m0, cat.spec(lote.receta_id, m0.id));
      if (n++ % 2) { c(RGB.bg, 'fill'); doc.rect(M, y, CW, filaH, 'F'); }
      c(RGB.line, 'draw'); doc.setLineWidth(0.15); doc.line(M, y + filaH, W - M, y + filaH);
      f('bold', 8.2); c(GRAFITO); centro(m.metodo, centros[0], y + 4.1, anchos[0] - 4);
      f('normal', 7.8); c(RGB.txt); centro(refLabel(m), centros[1], y + 4.1, anchos[1] - 4);
      f('bold', 8.2); centro(resultadoTxt(r, m), centros[2], y + 4.1, anchos[2] - 4);
      const ok = r.cumple === true;
      c(ok ? RGB.okSoft : RGB.badSoft, 'fill'); doc.roundedRect(centros[3] - 11, y + 1, 22, 4, 2, 2, 'F');
      f('bold', 7.2); c(ok ? RGB.ok : RGB.bad); centro(ok ? 'Cumple' : 'No cumple', centros[3], y + 3.85);
      y += filaH;
    });
  });

  // ---- Dictamen y observaciones ----
  const obs = lote.observaciones_liberacion ? doc.splitTextToSize(pdfTxt(lote.observaciones_liberacion), CW - 12) : [];
  if (y + 22 + (obs.length ? obs.length * 3.8 + 8 : 0) + 42 > H - 18) { doc.addPage(); y = 18; }
  y += 5;
  c(RGB.okSoft, 'fill'); doc.setDrawColor(...RGB.ok); doc.setLineWidth(0.4); doc.roundedRect(M, y, CW, 15, 3, 3, 'FD');
  f('bold', 11.5); c(RGB.ok); centro('DICTAMEN: PRODUCTO LIBERADO', W / 2, y + 6);
  f('normal', 8); c(RGB.txt);
  centro('El lote cumple con todas las especificaciones de calidad establecidas para su liberación en los análisis bromatológicos, fisicoquímicos, microbiológicos y sensoriales aplicables.', W / 2, y + 10.8, CW - 12);
  y += 19;
  if (obs.length) {
    f('bold', 8.4); c(GRAFITO); doc.text('Observaciones', M, y + 2);
    f('normal', 8); c(RGB.txt); doc.text(obs, M, y + 6.2); y += 7 + obs.length * 3.8;
  }

  // ---- Firmas: Jefe de calidad e Inspector de calidad ----
  const yf = Math.max(y + 22, H - 52);
  const firma = (x, nombre, puesto, rol) => {
    c(GRAFITO, 'draw'); doc.setLineWidth(0.35); doc.line(x - 34, yf, x + 34, yf);
    f('bold', 9.4); c(GRAFITO); centro(nombre || 'Pendiente de asignar', x, yf + 4.8, 70);
    f('normal', 7.8); c(RGB.muted); centro(puesto || rol, x, yf + 8.8, 70);
    f('bold', 7); c(TEAL); centro(rol.toUpperCase(), x, yf + 12.6);
  };
  firma(M + CW * 0.25, lote.firma_jefe_nombre, lote.firma_jefe_puesto, 'Jefe de calidad');
  firma(M + CW * 0.75, lote.firma_inspector_nombre, lote.firma_inspector_puesto, 'Inspector de calidad');
  f('normal', 7.4); c(RGB.muted);
  centro(`Liberó: ${lote.liberado_por_nombre || '—'}${lote.liberado_por_puesto ? ` (${lote.liberado_por_puesto})` : ''} el ${fechaHora(lote.liberado_en)}.`, W / 2, yf + 19);
  centro(`Documento generado por el sistema Liberación de producto. Consulta el folio ${lote.folio_certificado} en el sistema para confirmar su vigencia.`, W / 2, yf + 23, CW);

  // ---- Pie en cada página ----
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    c(TEAL, 'fill'); doc.rect(0, H - 12, W, 12, 'F');
    c(RGB.orange, 'fill'); doc.rect(0, H - 12, W, 0.9, 'F');
    f('normal', 7.4); doc.setTextColor(226, 242, 243);
    doc.text(pdfTxt(`Pet's Table S.A. de C.V. · Certificado de calidad ${lote.folio_certificado} · Lote ${lote.lote} · ${receta?.nombre_receta || ''}`), M, H - 5);
    doc.text(pdfTxt(`Versión ${APP_VERSION} · Página ${i} de ${total}`), W - M, H - 5, { align: 'right' });
  }
  doc.setProperties({ title: `Certificado de calidad ${lote.folio_certificado}`, subject: `Lote ${lote.lote}`, author: "Pet's Table S.A. de C.V.", creator: 'Liberación de producto' });
  doc.save(`Certificado-${lote.folio_certificado}-lote-${String(lote.lote).replace(/[^\w-]+/g, '')}.pdf`);
  toast(`Certificado ${lote.folio_certificado} descargado (lote del ${fmtDate(fechaLote(lote.fecha_analisis))}).`, 'success');
}
