# SinoTrack ST902L — Servidor GPS

Servidor TCP + API REST + Dashboard web para el rastreador GPS SinoTrack ST902L (protocolo H02).

## Stack

- **Node.js** — servidor TCP y HTTP
- **Express** — API REST
- **Socket.IO** — actualizaciones en tiempo real al dashboard
- **Prisma** — ORM para PostgreSQL
- **Leaflet.js** — mapas en el dashboard (OpenStreetMap, sin API key)

## Requisitos

- Node.js 18+
- PostgreSQL 14+ (o Railway / Supabase / Neon gratis)

## Setup rápido

### 1. Clonar e instalar

```bash
git clone <repo>
cd sinotrack-st902l-server
npm install
```

### 2. Configurar base de datos

Editar `.env`:

```env
DATABASE_URL="postgresql://usuario:password@localhost:5432/sinotrack?schema=public"
TCP_PORT=5013
HTTP_PORT=3000
```

### 3. Crear tablas

```bash
npm run db:migrate
```

### 4. Iniciar servidor

```bash
# Producción
npm start

# Desarrollo (auto-reload)
npm run dev
```

### 5. Abrir dashboard

```
http://localhost:3000
```

## Estructura de archivos

```
├── server.js          # Servidor TCP + API + Socket.IO
├── prisma/
│   └── schema.prisma  # Modelos DB (Vehicle + LocationReport)
├── public/
│   └── index.html     # Dashboard web completo
├── .env               # Configuración (DATABASE_URL, puertos)
└── package.json
```

## API REST

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/vehicles` | Registrar vehículo |
| `GET`  | `/api/vehicles` | Listar todos |
| `PUT`  | `/api/vehicles/:id` | Editar nombre/patente/color |
| `DELETE` | `/api/vehicles/:id` | Eliminar con historial |
| `GET`  | `/api/vehicles/latest` | Última posición de todos |
| `GET`  | `/api/vehicles/:id/history?limit=100` | Historial |
| `GET`  | `/api/stats` | Estadísticas generales |

## Configuración del rastreador ST902L

En el dispositivo configurar servidor TCP a:
- **IP:** tu IP pública o dominio
- **Puerto:** 5013 (TCP_PORT)

> ⚠️ El dispositivo debe estar registrado en el dashboard antes de que sus tramas sean aceptadas.

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | — | URL de conexión PostgreSQL |
| `TCP_PORT` | `5013` | Puerto TCP para el tracker |
| `HTTP_PORT` | `3000` | Puerto HTTP para dashboard y API |
