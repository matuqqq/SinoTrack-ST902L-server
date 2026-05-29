-- Add speedLimit to Vehicle
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "speedLimit" DOUBLE PRECISION;

-- Composite index on LocationReport
CREATE INDEX IF NOT EXISTS "LocationReport_vehicleId_timestamp_idx" ON "LocationReport"("vehicleId", "timestamp");

-- CreateTable User
CREATE TABLE IF NOT EXISTS "User" (
    "id"           SERIAL NOT NULL,
    "username"     TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role"         TEXT NOT NULL DEFAULT 'user',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateTable RefreshToken
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id"        SERIAL NOT NULL,
    "token"     TEXT NOT NULL,
    "userId"    INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ApiKey
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "keyHash"   TEXT NOT NULL,
    "userId"    INTEGER NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "lastUsed"  TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Geofence
CREATE TABLE IF NOT EXISTS "Geofence" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      TEXT NOT NULL DEFAULT 'circle',
    "latitude"  DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius"    DOUBLE PRECISION,
    "polygon"   JSONB,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable GeofenceEvent
CREATE TABLE IF NOT EXISTS "GeofenceEvent" (
    "id"         SERIAL NOT NULL,
    "geofenceId" INTEGER NOT NULL,
    "vehicleId"  TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "latitude"   DOUBLE PRECISION NOT NULL,
    "longitude"  DOUBLE PRECISION NOT NULL,
    "timestamp"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeofenceEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GeofenceEvent_vehicleId_idx" ON "GeofenceEvent"("vehicleId");
CREATE INDEX IF NOT EXISTS "GeofenceEvent_geofenceId_idx" ON "GeofenceEvent"("geofenceId");
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_geofenceId_fkey"
    FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Trip
CREATE TABLE IF NOT EXISTS "Trip" (
    "id"        SERIAL NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime"   TIMESTAMP(3),
    "distance"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxSpeed"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Trip_vehicleId_idx" ON "Trip"("vehicleId");
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable Webhook
CREATE TABLE IF NOT EXISTS "Webhook" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "url"       TEXT NOT NULL,
    "events"    JSONB NOT NULL,
    "secret"    TEXT,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable Alert
CREATE TABLE IF NOT EXISTS "Alert" (
    "id"        SERIAL NOT NULL,
    "type"      TEXT NOT NULL,
    "vehicleId" TEXT,
    "payload"   JSONB NOT NULL,
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Alert_read_idx" ON "Alert"("read");
CREATE INDEX IF NOT EXISTS "Alert_createdAt_idx" ON "Alert"("createdAt");
CREATE INDEX IF NOT EXISTS "Alert_type_idx" ON "Alert"("type");
