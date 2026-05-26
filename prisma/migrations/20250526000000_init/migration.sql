-- CreateTable
CREATE TABLE "Vehicle" (
    "id"        TEXT NOT NULL,
    "name"      TEXT,
    "plate"     TEXT,
    "color"     TEXT DEFAULT '#3B82F6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationReport" (
    "id"        SERIAL NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "validGps"  BOOLEAN NOT NULL,
    "latitude"  DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed"     DOUBLE PRECISION NOT NULL,
    "course"    DOUBLE PRECISION NOT NULL,
    "statusHex" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationReport_vehicleId_idx" ON "LocationReport"("vehicleId");

-- CreateIndex
CREATE INDEX "LocationReport_timestamp_idx" ON "LocationReport"("timestamp");

-- AddForeignKey
ALTER TABLE "LocationReport" ADD CONSTRAINT "LocationReport_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
