const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SinoTrack ST902L — API',
      version: '3.0.0',
      description: `
API para rastreo GPS de vehículos con dispositivos **SinoTrack ST902L**.

## Autenticación
1. **Registrate:** \`POST /api/auth/register\` — el primer usuario creado es **admin** automáticamente
2. **Login:** \`POST /api/auth/login\` → \`accessToken\` (15min) + \`refreshToken\` (7 días)
3. **Header:** \`Authorization: Bearer <accessToken>\` en cada request protegido
4. **Renovar:** \`POST /api/auth/refresh\` → rota el refresh token (el viejo queda inválido)

## WebSocket (Socket.IO)
Conectar con auth:
\`\`\`js
const socket = io({ auth: { token: 'Bearer <accessToken>' } });
\`\`\`

| Evento | Descripción |
|--------|-------------|
| \`locationUpdate\` | Nueva posición GPS recibida |
| \`speedAlert\` | Vehículo superó su \`speedLimit\` |
| \`geofenceAlert\` | Vehículo entró/salió de una zona |
| \`idleAlert\` | Vehículo detenido > \`IDLE_ALERT_MINUTES\` |
| \`deviceTimeout\` | Dispositivo sin reporte > \`DEVICE_TIMEOUT_MINUTES\` |
| \`devicesOnline\` | Lista actualizada de dispositivos TCP conectados |

## Features principales
- 🗺️ **Búsqueda por zona:** \`GET /api/vehicles/nearby?lat=X&lon=Y&radius=Z\`
- 📅 **Filtro por fecha:** \`GET /api/vehicles/:id/history?from=ISO&to=ISO\`
- 📊 **Analytics:** \`GET /api/analytics/vehicles/:id?period=day|week|month\`
- 🏁 **Viajes auto-detectados:** \`GET /api/vehicles/:id/trips\`
- 📍 **Geocoding:** \`GET /api/geocode/reverse?lat=X&lon=Y\`
- 📤 **Export CSV/GPX:** \`GET /api/vehicles/:id/history/export?format=csv|gpx\`
- 🔔 **Webhooks:** notificaciones HTTP con firma HMAC a sistemas externos
      `,
    },
    servers: [{ url: '/api', description: 'API' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token de /api/auth/login'
        }
      },
      parameters: {
        VehicleId: {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string' },
          description: 'ID del dispositivo GPS (IMEI)',
          example: '352592063390145'
        }
      },
      schemas: {
        Vehicle: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '352592063390145' },
            name: { type: 'string', nullable: true, example: 'Ford Ranger 2022' },
            plate: { type: 'string', nullable: true, example: 'ABC 123' },
            color: { type: 'string', nullable: true, example: '#3B82F6' },
            speedLimit: { type: 'number', nullable: true, example: 120, description: 'km/h — emite speedAlert si se supera' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        VehicleInput: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', example: '352592063390145' },
            name: { type: 'string', example: 'Ford Ranger 2022' },
            plate: { type: 'string', example: 'ABC 123' },
            color: { type: 'string', example: '#3B82F6', description: 'Hex #RRGGBB' },
            speedLimit: { type: 'number', example: 120, description: 'Límite de velocidad en km/h' }
          }
        },
        VehicleUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            plate: { type: 'string' },
            color: { type: 'string', description: 'Hex #RRGGBB' },
            speedLimit: { type: 'number', nullable: true }
          }
        },
        VehicleResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: { '$ref': '#/components/schemas/Vehicle' }
          }
        },
        VehiclesPaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': '#/components/schemas/Vehicle' } },
            pagination: { '$ref': '#/components/schemas/Pagination' }
          }
        },
        LocationReport: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            vehicleId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            validGps: { type: 'boolean' },
            latitude: { type: 'number', format: 'float', example: -34.6037 },
            longitude: { type: 'number', format: 'float', example: -58.3816 },
            speed: { type: 'number', description: 'km/h' },
            course: { type: 'number', description: 'grados 0-360' },
            statusHex: { type: 'string', example: '00000000' },
            status: { '$ref': '#/components/schemas/StatusHex', description: 'Estado parseado del statusHex' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        HistoryPaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': '#/components/schemas/LocationReport' } },
            pagination: { '$ref': '#/components/schemas/Pagination' }
          }
        },
        NearbyVehicle: {
          allOf: [
            { '$ref': '#/components/schemas/Vehicle' },
            {
              type: 'object',
              properties: {
                latestReport: { '$ref': '#/components/schemas/LocationReport' },
                distanceKm: { type: 'number', example: 2.345 }
              }
            }
          ]
        },
        NearbyResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            center: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } } },
            radiusKm: { type: 'number' },
            count: { type: 'integer' },
            data: { type: 'array', items: { '$ref': '#/components/schemas/NearbyVehicle' } }
          }
        },
        Geofence: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', example: 'Depósito central' },
            type: { type: 'string', enum: ['circle', 'polygon'] },
            latitude: { type: 'number', nullable: true },
            longitude: { type: 'number', nullable: true },
            radius: { type: 'number', nullable: true, description: 'km' },
            polygon: { type: 'array', nullable: true, items: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } } } },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        GeofenceCircleInput: {
          type: 'object',
          required: ['name', 'type', 'latitude', 'longitude', 'radius'],
          properties: {
            name: { type: 'string', example: 'Depósito central' },
            type: { type: 'string', enum: ['circle'] },
            latitude: { type: 'number', example: -34.6037 },
            longitude: { type: 'number', example: -58.3816 },
            radius: { type: 'number', example: 0.5, description: 'km' },
            active: { type: 'boolean', default: true }
          }
        },
        GeofencePolygonInput: {
          type: 'object',
          required: ['name', 'type', 'polygon'],
          properties: {
            name: { type: 'string', example: 'Zona industrial' },
            type: { type: 'string', enum: ['polygon'] },
            polygon: {
              type: 'array', minItems: 3,
              items: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } } },
              example: [{ lat: -34.60, lon: -58.38 }, { lat: -34.61, lon: -58.38 }, { lat: -34.61, lon: -58.37 }]
            },
            active: { type: 'boolean', default: true }
          }
        },
        GeofenceResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: { '$ref': '#/components/schemas/Geofence' }
          }
        },
        GeofenceEvent: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            geofenceId: { type: 'integer' },
            vehicleId: { type: 'string' },
            type: { type: 'string', enum: ['enter', 'exit'] },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        Trip: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            vehicleId: { type: 'string' },
            startTime: { type: 'string', format: 'date-time' },
            endTime: { type: 'string', format: 'date-time', nullable: true },
            distance: { type: 'number', description: 'km' },
            maxSpeed: { type: 'number', description: 'km/h' },
            active: { type: 'boolean', description: 'true = viaje en curso' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        TripsPaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': '#/components/schemas/Trip' } },
            pagination: { '$ref': '#/components/schemas/Pagination' }
          }
        },
        VehicleStats: {
          type: 'object',
          properties: {
            distanceKm: { type: 'number', example: 150.3 },
            movingMinutes: { type: 'integer', example: 185 },
            idleMinutes: { type: 'integer', example: 45 },
            maxSpeed: { type: 'number', example: 118.5 },
            avgSpeed: { type: 'number', example: 65.2 },
            reportCount: { type: 'integer', example: 1440 },
            tripsCount: { type: 'integer', example: 3 }
          }
        },
        VehicleAnalytics: {
          type: 'object',
          properties: {
            vehicleId: { type: 'string' },
            period: { type: 'string', enum: ['day', 'week', 'month'] },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            stats: { '$ref': '#/components/schemas/VehicleStats' }
          }
        },
        FleetAnalytics: {
          type: 'object',
          properties: {
            period: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            vehicles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vehicleId: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  plate: { type: 'string', nullable: true },
                  stats: { '$ref': '#/components/schemas/VehicleStats' }
                }
              }
            },
            totals: {
              type: 'object',
              properties: {
                distanceKm: { type: 'number' },
                reportCount: { type: 'integer' }
              }
            }
          }
        },
        GeocodeResult: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            lat: { type: 'number' },
            lon: { type: 'number' },
            address: {
              type: 'object',
              properties: {
                display: { type: 'string', example: 'Av. Corrientes 1234, Buenos Aires, Argentina' },
                road: { type: 'string', nullable: true, example: 'Av. Corrientes' },
                suburb: { type: 'string', nullable: true },
                city: { type: 'string', nullable: true, example: 'Buenos Aires' },
                state: { type: 'string', nullable: true, example: 'Ciudad Autónoma de Buenos Aires' },
                country: { type: 'string', nullable: true, example: 'Argentina' },
                countryCode: { type: 'string', nullable: true, example: 'AR' }
              }
            }
          }
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', example: 'Slack alertas' },
            url: { type: 'string', format: 'uri' },
            events: {
              type: 'array',
              items: { type: 'string', enum: ['speedAlert', 'geofenceAlert', 'deviceTimeout', 'idleAlert', '*'] },
              example: ['speedAlert', 'geofenceAlert']
            },
            secret: { type: 'string', nullable: true, description: 'Oculto en respuestas — solo "***" si está configurado' },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        WebhookInput: {
          type: 'object',
          required: ['name', 'url', 'events'],
          properties: {
            name: { type: 'string', example: 'Slack alertas' },
            url: { type: 'string', format: 'uri', example: 'https://hooks.slack.com/services/...' },
            events: {
              type: 'array',
              items: { type: 'string', enum: ['speedAlert', 'geofenceAlert', 'deviceTimeout', 'idleAlert', '*'] },
              example: ['speedAlert', 'geofenceAlert']
            },
            secret: { type: 'string', description: 'HMAC secret para verificar autenticidad del payload' },
            active: { type: 'boolean', default: true }
          }
        },
        WebhookResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: { '$ref': '#/components/schemas/Webhook' }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
            uptime: { type: 'number', description: 'segundos desde inicio', example: 3600.5 },
            timestamp: { type: 'string', format: 'date-time' },
            db: { type: 'string', enum: ['ok', 'error'], example: 'ok' }
          }
        },
        UserResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                username: { type: 'string' },
                email: { type: 'string', format: 'email' },
                role: { type: 'string', enum: ['admin', 'user'], example: 'admin' },
                createdAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string', description: 'JWT válido por JWT_EXPIRES_IN (default 15min)' },
                refreshToken: { type: 'string', description: 'Token de un solo uso — se rota en cada /refresh' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    username: { type: 'string' },
                    role: { type: 'string', enum: ['admin', 'user'] }
                  }
                }
              }
            }
          }
        },
        RefreshResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string', description: 'Nuevo access token' },
                refreshToken: { type: 'string', description: 'Nuevo refresh token (el anterior ya no es válido)' }
              }
            }
          }
        },
        Stats: {
          type: 'object',
          properties: {
            vehicleCount: { type: 'integer' },
            reportCount: { type: 'integer' },
            devicesOnline: { type: 'integer' },
            latestReports: { type: 'array', items: { '$ref': '#/components/schemas/LocationReport' } },
            tcpPort: { type: 'integer' },
            httpPort: { type: 'integer' }
          }
        },
        LogEntry: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['info', 'warn', 'error', 'success'] },
            message: { type: 'string' },
            time: { type: 'string', format: 'date-time' }
          }
        },
        Odometer: {
          type: 'object',
          properties: {
            vehicleId: { type: 'string' },
            totalDistanceKm: { type: 'number', description: 'Distancia total acumulada de viajes completados (km)' },
            completedTrips: { type: 'integer' },
            lastTrip: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        StatusHex: {
          type: 'object',
          description: 'Estado parseado del byte de status del protocolo H02',
          properties: {
            ignition: { type: 'boolean', description: 'Ignición/ACC encendida' },
            charging: { type: 'boolean' },
            gpsValid: { type: 'boolean' },
            moving: { type: 'boolean' },
            overspeed: { type: 'boolean' },
            armed: { type: 'boolean' },
            alarm: { type: 'string', nullable: true, description: 'Descripción de la alarma activa, null si ninguna' },
            raw: { type: 'string', example: '01000000' }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', example: 'Script de backup' },
            active: { type: 'boolean' },
            lastUsed: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ApiKeyCreated: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            message: { type: 'string', example: 'Guardá esta clave — no se vuelve a mostrar' },
            data: {
              allOf: [
                { '$ref': '#/components/schemas/ApiKey' },
                { type: 'object', properties: { key: { type: 'string', description: 'La API key completa — solo visible en este response', example: 'stk_abc123...' } } }
              ]
            }
          }
        },
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            type: { type: 'string', enum: ['speedAlert', 'geofenceAlert', 'idleAlert', 'deviceTimeout'] },
            vehicleId: { type: 'string', nullable: true },
            payload: { type: 'object', description: 'Datos específicos de la alerta' },
            read: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            pageSize: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 150 },
            totalPages: { type: 'integer', example: 8 }
          }
        }
      },
      responses: {
        Unauthorized: {
          description: 'Token requerido o inválido',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { error: { type: 'string', example: 'Token de acceso requerido' } } }
            }
          }
        },
        BadRequest: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } }
                }
              }
            }
          }
        },
        ServerError: {
          description: 'Error interno',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { error: { type: 'string' } } }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./routes/*.js', './server.js']
};

module.exports = swaggerJsdoc(options);
