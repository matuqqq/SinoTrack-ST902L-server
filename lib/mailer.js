const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return false;
  const recipient = to || process.env.ALERT_EMAIL;
  if (!recipient) return false;
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: recipient, subject, html });
    return true;
  } catch (e) {
    console.error(`[Mailer] ${e.message}`);
    return false;
  }
}

async function sendSpeedAlert({ vehicleId, vehicleName, speed, speedLimit, latitude, longitude, timestamp }) {
  return sendMail({
    subject: `🚨 Alerta de velocidad — ${vehicleName}`,
    html: `<h2 style="color:#ef4444">Alerta de Velocidad</h2>
      <p><b>Vehículo:</b> ${vehicleName} (${vehicleId})</p>
      <p><b>Velocidad:</b> ${speed.toFixed(1)} km/h &nbsp;·&nbsp; <b>Límite:</b> ${speedLimit} km/h</p>
      <p><b>Posición:</b> ${latitude}, ${longitude}</p>
      <p><b>Hora:</b> ${new Date(timestamp).toLocaleString('es-AR')}</p>
      <p><a href="https://www.google.com/maps?q=${latitude},${longitude}">Ver en Google Maps</a></p>`
  });
}

async function sendGeofenceAlert({ vehicleId, geofenceName, type, latitude, longitude, timestamp }) {
  const action = type === 'enter' ? 'entró en' : 'salió de';
  return sendMail({
    subject: `📍 Geofence — ${vehicleId} ${action} "${geofenceName}"`,
    html: `<h2 style="color:#f59e0b">Alerta de Geofence</h2>
      <p><b>Vehículo:</b> ${vehicleId}</p>
      <p><b>Evento:</b> ${action.charAt(0).toUpperCase() + action.slice(1)} la zona "<b>${geofenceName}</b>"</p>
      <p><b>Posición:</b> ${latitude}, ${longitude}</p>
      <p><b>Hora:</b> ${new Date(timestamp).toLocaleString('es-AR')}</p>
      <p><a href="https://www.google.com/maps?q=${latitude},${longitude}">Ver en Google Maps</a></p>`
  });
}

async function sendWeeklyReport({ vehicles, fromDate, toDate }) {
  const rows = vehicles.map(v => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${v.name || v.id}${v.plate ? ` (${v.plate})` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${v.stats.distanceKm} km</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${v.stats.tripsCount || 0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${v.stats.movingMinutes} min</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${v.stats.maxSpeed} km/h</td>
    </tr>`).join('');
  return sendMail({
    subject: `📊 Reporte semanal de flota — ${fromDate} al ${toDate}`,
    html: `<h2>Reporte Semanal de Flota</h2>
      <p style="color:#666">Período: <b>${fromDate}</b> — <b>${toDate}</b></p>
      <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;margin-top:16px">
        <thead><tr style="background:#1a1d27;color:white">
          <th style="padding:10px 12px;text-align:left">Vehículo</th>
          <th style="padding:10px 12px">Distancia</th>
          <th style="padding:10px 12px">Viajes</th>
          <th style="padding:10px 12px">Tiempo en movimiento</th>
          <th style="padding:10px 12px">Vel. máx.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#aaa;font-size:12px;margin-top:16px">Generado automáticamente por SinoTrack GPS Server</p>`
  });
}

module.exports = { sendMail, sendSpeedAlert, sendGeofenceAlert, sendWeeklyReport };
