-- CreateEnum
CREATE TYPE "ReleaseRequestState" AS ENUM ('open', 'cancelled', 'completed');

-- AlterTable
ALTER TABLE "handoff_rules" ADD COLUMN "released_by_request_id" TEXT;

-- CreateTable
CREATE TABLE "release_requests" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "opened_by_user_id" TEXT,
    "state" "ReleaseRequestState" NOT NULL DEFAULT 'open',
    "required_votes" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "release_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_votes" (
    "request_id" TEXT NOT NULL,
    "witness_user_id" TEXT NOT NULL,
    "voted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_votes_pkey" PRIMARY KEY ("request_id","witness_user_id")
);

-- CreateTable
CREATE TABLE "release_vote_shares" (
    "request_id" TEXT NOT NULL,
    "witness_user_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "wrapped_share" TEXT NOT NULL,

    CONSTRAINT "release_vote_shares_pkey" PRIMARY KEY ("request_id","witness_user_id","rule_id","recipient_user_id")
);

-- CreateIndex
CREATE INDEX "release_requests_owner_id_state_idx" ON "release_requests"("owner_id", "state");

-- CreateIndex
CREATE INDEX "release_vote_shares_recipient_user_id_idx" ON "release_vote_shares"("recipient_user_id");

-- AddForeignKey
ALTER TABLE "release_requests" ADD CONSTRAINT "release_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_requests" ADD CONSTRAINT "release_requests_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_votes" ADD CONSTRAINT "release_votes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "release_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_vote_shares" ADD CONSTRAINT "release_vote_shares_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "release_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_vote_shares" ADD CONSTRAINT "release_vote_shares_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "handoff_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_vote_shares" ADD CONSTRAINT "release_vote_shares_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One open request per owner. Prisma cannot express a partial unique index, so it lives only here.
CREATE UNIQUE INDEX "release_requests_one_open_per_owner" ON "release_requests"("owner_id") WHERE "state" = 'open';
