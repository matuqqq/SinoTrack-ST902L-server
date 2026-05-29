const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

const warnings = [
  ['JWT_SECRET', s => s.length < 32, 'JWT_SECRET muy corto — usar al menos 32 caracteres'],
  ['JWT_REFRESH_SECRET', s => s.length < 32, 'JWT_REFRESH_SECRET muy corto — usar al menos 32 caracteres'],
  ['JWT_SECRET', s => s.includes('cambiar-esto'), 'JWT_SECRET es el valor de ejemplo — cambiar en producción'],
  ['JWT_REFRESH_SECRET', s => s.includes('cambiar-esto'), 'JWT_REFRESH_SECRET es el valor de ejemplo — cambiar en producción']
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`\n❌ FATAL: Variable de entorno "${key}" no está definida.\n   Revisá tu archivo .env\n`);
    process.exit(1);
  }
}

for (const [key, check, msg] of warnings) {
  if (process.env[key] && check(process.env[key])) {
    console.warn(`⚠️  [ENV] ${msg}`);
  }
}
