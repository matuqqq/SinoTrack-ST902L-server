// SinoTrack ST902L — H02 protocol status byte parsing
// Status is 4 bytes (8 hex chars): [status][alarm][io][power]

const ALARM_CODES = {
  0x01: 'SOS',
  0x02: 'Corte de corriente',
  0x03: 'Vibración',
  0x04: 'Entró en zona',
  0x05: 'Salió de zona',
  0x06: 'Movimiento detectado',
  0x09: 'Overspeed',
  0x11: 'Batería baja',
  0x12: 'Apagado',
  0x13: 'Encendido',
  0x14: 'Antena GPS desconectada',
  0x15: 'Antena GPS reconectada',
  0xFF: 'Normal'
};

function parseStatusHex(hex) {
  if (!hex || hex === '00000000' || hex.length < 8) {
    return { ignition: false, charging: false, moving: false, alarm: null, armed: false, raw: hex || '00000000' };
  }
  const b = [];
  for (let i = 0; i < Math.min(hex.length, 8); i += 2) {
    b.push(parseInt(hex.slice(i, i + 2), 16) || 0);
  }
  const s0 = b[0], alarm = b[1];
  return {
    ignition: !!(s0 & 0x01),
    charging: !!(s0 & 0x02),
    gpsValid: !!(s0 & 0x04),
    moving:   !!(s0 & 0x20),
    overspeed:!!(s0 & 0x40),
    armed:    !!(s0 & 0x80),
    alarm: alarm && alarm !== 0xFF ? (ALARM_CODES[alarm] || `Alarma 0x${alarm.toString(16).padStart(2,'0')}`) : null,
    raw: hex
  };
}

module.exports = { parseStatusHex };
