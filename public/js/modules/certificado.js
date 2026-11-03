// =====================================================================
// Certificado de calidad (PDF tamaño carta) de un lote liberado.
// Toma el folio y los datos de liberación de brom_muestras y los resultados
// de cada área de análisis; se genera en el navegador con jsPDF.
// =====================================================================
import { toast, fmtDate, fechaLote, refLabel, resultadoTxt, criterio, recetaTxt, TZ, APP_VERSION } from '../core.js';
import { LOGO, cargarJsPDF, pdfTxt, RGB, hexRGB } from './pdf.js';

const fechaLarga = (iso) => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
const fechaHora = (ts) => new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));

export async function generarCertificado(lote, resultados, cat) {
  if (!lote.liberado_en || !lote.folio_certificado) { toast('El certificado se emite cuando el lote está liberado.', 'warning'); return; }
  const jsPDF = await cargarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const W = 215.9, H = 279.4, M = 16, CW = W - 2 * M;
  const receta = cat.recetas.find((r) => r.id === lote.receta_id);
  const colorReceta = hexRGB(receta?.color);
  const f = (estilo, size) => { doc.setFont('helvetica', estilo); doc.setFontSize(size); };
  const c = (rgb, tipo = 'text') => { if (tipo === 'text') doc.setTextColor(...rgb); else if (tipo === 'fill') doc.setFillColor(...rgb); else doc.setDrawColor(...rgb); };
  let y = 0;

  // ---- Encabezado ----
  c(RGB.navy, 'fill'); doc.rect(0, 0, W, 32, 'F');
  c(colorReceta, 'fill'); doc.rect(0, 32, W, 1.4, 'F');
  doc.addImage(LOGO, 'PNG', M, 5, 27, 21.6, 'logo', 'FAST');
  f('bold', 8.5); doc.setTextColor(255, 186, 120); doc.text('CALIDAD DE PRODUCTO', M + 34, 12.5, { charSpace: 0.6 });
  f('bold', 19); doc.setTextColor(255, 255, 255); doc.text('Certificado de calidad', M + 34, 21.5);
  f('normal', 8.5); doc.setTextColor(200, 214, 226); doc.text("Pet's Table S.A. de C.V.", M + 34, 27);
  f('normal', 7.8); doc.setTextColor(170, 190, 206); doc.text('Folio', W - M, 12.5, { align: 'right' });
  f('bold', 13); doc.setTextColor(255, 255, 255); doc.text(pdfTxt(lote.folio_certificado), W - M, 19.5, { align: 'right' });
  f('normal', 7.8); doc.setTextColor(170, 190, 206); doc.text(pdfTxt(`Emitido el ${fechaHora(lote.liberado_en)}`), W - M, 26, { align: 'right' });
  y = 39;

  // ---- Datos del producto ----
  const datos = [
    ['Producto', receta?.nombre_receta || '—'], ['Código de receta', receta?.codigo || '—'], ['Especie', receta?.especie || '—'],
    ['Número de lote', lote.lote], ['Fecha del lote', fechaLarga(fechaLote(lote.fecha_analisis))], ['Fecha de liberación', fechaLarga(fechaLote(lote.liberado_en))],
  ];
  c(RGB.bg, 'fill'); c(RGB.line, 'draw'); doc.setLineWidth(0.25); doc.roundedRect(M, y, CW, 26, 3, 3, 'FD');
  c(colorReceta, 'fill'); doc.roundedRect(M, y, 2.4, 26, 1.2, 1.2, 'F');
  datos.forEach(([k, v], i) => {
    const col = i % 3, fila = Math.floor(i / 3);
    const x = M + 7 + col * (CW / 3), yy = y + 7.5 + fila * 11;
    f('normal', 7); c(RGB.muted); doc.text(pdfTxt(k.toUpperCase()), x, yy, { charSpace: 0.3 });
    f('bold', 10); c(RGB.navy); doc.text(pdfTxt(v), x, yy + 4.8, { maxWidth: CW / 3 - 8 });
  });
  y += 32;

  // ---- Resultados por área (una sola tabla; cada área con su franja de color) ----
  const porMetodo = new Map(resultados.map((r) => [r.metodo_id, r]));
  const anchos = [56, 62, 36, 29.9];
  const filaH = 5.9;
  const cabecera = () => {
    c(RGB.navy, 'fill'); doc.roundedRect(M, y, CW, 6.5, 1.5, 1.5, 'F');
    f('bold', 7.4); doc.setTextColor(255, 255, 255);
    let x = M + 3; ['Método', 'Especificación', 'Resultado', 'Dictamen'].forEach((t, i) => { doc.text(t.toUpperCase(), x, y + 4.4, { charSpace: 0.2 }); x += anchos[i]; });
    y += 7.5;
  };
  const salto = (h) => { if (y + h > H - 20) { doc.addPage(); y = 16; cabecera(); } };
  cabecera();
  cat.areas.forEach((a) => {
    const filas = cat.metodos.filter((m) => m.area === a.id && porMetodo.has(m.id));
    if (!filas.length) return;
    salto(6 + filaH * 2);
    const rgb = hexRGB(a.color);
    doc.setFillColor(...rgb.map((v) => Math.round(v + (255 - v) * 0.86))); doc.rect(M, y, CW, 5.6, 'F');
    c(rgb, 'fill'); doc.rect(M, y, 1.6, 5.6, 'F');
    f('bold', 8.2); c(rgb); doc.text(pdfTxt(`Análisis ${a.nombre.toLowerCase()}`), M + 4, y + 3.9);
    f('normal', 7.4); doc.text(`${filas.length} ${filas.length === 1 ? 'método' : 'métodos'}`, W - M - 3, y + 3.9, { align: 'right' });
    y += 5.6;
    filas.forEach((m0) => {
      salto(filaH);
      const r = porMetodo.get(m0.id);
      const m = criterio(m0, cat.spec(lote.receta_id, m0.id));
      c(RGB.line, 'draw'); doc.setLineWidth(0.15); doc.line(M, y + filaH, W - M, y + filaH);
      let x = M + 3;
      f('bold', 8.2); c(RGB.navy); doc.text(pdfTxt(m.metodo), x, y + 4, { maxWidth: anchos[0] - 4 }); x += anchos[0];
      f('normal', 7.8); c(RGB.txt); doc.text(pdfTxt(refLabel(m)), x, y + 4, { maxWidth: anchos[1] - 4 }); x += anchos[1];
      f('bold', 8.2); doc.text(pdfTxt(resultadoTxt(r, m)), x, y + 4, { maxWidth: anchos[2] - 4 }); x += anchos[2];
      const ok = r.cumple === true;
      c(ok ? RGB.okSoft : RGB.badSoft, 'fill'); doc.roundedRect(x - 1, y + 1, 21, 4, 2, 2, 'F');
      f('bold', 7.2); c(ok ? RGB.ok : RGB.bad); doc.text(ok ? 'Cumple' : 'No cumple', x + 9.5, y + 3.85, { align: 'center' });
      y += filaH;
    });
    y += 1.5;
  });

  // ---- Dictamen, observaciones y firma ----
  const obs = lote.observaciones_liberacion ? doc.splitTextToSize(pdfTxt(lote.observaciones_liberacion), CW - 10) : [];
  if (y + 18 + (obs.length ? obs.length * 3.8 + 6 : 0) + 34 > H - 16) { doc.addPage(); y = 16; }
  y += 3;
  c(RGB.okSoft, 'fill'); doc.setDrawColor(...RGB.ok); doc.setLineWidth(0.4); doc.roundedRect(M, y, CW, 14, 3, 3, 'FD');
  f('bold', 11); c(RGB.ok); doc.text('DICTAMEN: PRODUCTO LIBERADO', M + 5, y + 5.8);
  f('normal', 8); c(RGB.txt);
  doc.text(pdfTxt('El lote cumple con todas las especificaciones de calidad establecidas para su liberación en los análisis bromatológicos, fisicoquímicos, microbiológicos y sensoriales aplicables.'), M + 5, y + 10.4, { maxWidth: CW - 10 });
  y += 18;
  if (obs.length) {
    f('bold', 8.2); c(RGB.navy); doc.text('Observaciones', M, y + 2);
    f('normal', 8); c(RGB.txt); doc.text(obs, M, y + 6); y += 6 + obs.length * 3.8;
  }
  const yf = Math.max(y + 18, H - 40);
  c(RGB.navy, 'draw'); doc.setLineWidth(0.3); doc.line(M + 18, yf, M + 88, yf);
  f('bold', 9); c(RGB.navy); doc.text(pdfTxt(lote.liberado_por_nombre || '—'), M + 53, yf + 4.5, { align: 'center' });
  f('normal', 7.8); c(RGB.muted); doc.text(pdfTxt(lote.liberado_por_puesto || 'Jefatura de calidad'), M + 53, yf + 8.5, { align: 'center' });
  doc.text('Liberó', M + 53, yf + 12, { align: 'center' });
  c(RGB.bg, 'fill'); c(RGB.line, 'draw'); doc.roundedRect(W - M - 70, yf - 15, 70, 27, 3, 3, 'FD');
  f('normal', 7.2); c(RGB.muted); doc.text('VERIFICACIÓN', W - M - 66, yf - 9.5, { charSpace: 0.3 });
  f('bold', 8.8); c(RGB.navy); doc.text(pdfTxt(`Folio ${lote.folio_certificado}`), W - M - 66, yf - 4.2);
  f('normal', 7.3); c(RGB.txt);
  doc.text(doc.splitTextToSize(pdfTxt('Documento generado por el sistema Liberación de producto. Consulta el folio en el sistema para confirmar su vigencia.'), 62), W - M - 66, yf + 0.4);

  // ---- Pie en cada página ----
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    c(RGB.line, 'draw'); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14);
    f('normal', 7.5); c(RGB.muted);
    doc.text(pdfTxt(`Pet's Table S.A. de C.V. · Liberación de producto versión ${APP_VERSION} · ${recetaTxt(receta)} · Lote ${lote.lote}`), M, H - 9);
    doc.text(`Página ${i} de ${total}`, W - M, H - 9, { align: 'right' });
  }
  doc.setProperties({ title: `Certificado de calidad ${lote.folio_certificado}`, subject: `Lote ${lote.lote}`, author: "Pet's Table S.A. de C.V.", creator: 'Liberación de producto' });
  doc.save(`Certificado-${lote.folio_certificado}-lote-${String(lote.lote).replace(/[^\w-]+/g, '')}.pdf`);
  toast(`Certificado ${lote.folio_certificado} descargado (lote del ${fmtDate(fechaLote(lote.fecha_analisis))}).`, 'success');
}
