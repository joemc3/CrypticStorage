-- CreateEnum
CREATE TYPE "WitnessStatus" AS ENUM ('invited', 'accepted', 'declined', 'removed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "witness_threshold" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "witnesses" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "witness_user_id" TEXT NOT NULL,
    "status" "WitnessStatus" NOT NULL DEFAULT 'invited',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "witnesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contact_user_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "verified_in_person" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "witnesses_witness_user_id_status_idx" ON "witnesses"("witness_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "witnesses_owner_id_witness_user_id_key" ON "witnesses"("owner_id", "witness_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_keys_user_id_contact_user_id_key" ON "trusted_keys"("user_id", "contact_user_id");

-- AddForeignKey
ALTER TABLE "witnesses" ADD CONSTRAINT "witnesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "witnesses" ADD CONSTRAINT "witnesses_witness_user_id_fkey" FOREIGN KEY ("witness_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_keys" ADD CONSTRAINT "trusted_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_keys" ADD CONSTRAINT "trusted_keys_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
