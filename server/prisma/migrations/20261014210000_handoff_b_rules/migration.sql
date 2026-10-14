-- CreateEnum
CREATE TYPE "HandoffRuleState" AS ENUM ('active', 'warning', 'released_timer', 'released_quorum', 'revoked');

-- CreateTable
CREATE TABLE "handoff_rules" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "file_id" TEXT,
    "folder_id" TEXT,
    "period_days" INTEGER NOT NULL,
    "state" "HandoffRuleState" NOT NULL DEFAULT 'active',
    "wrapped_release_key_owner" TEXT NOT NULL,
    "shares_stale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminded_75_at" TIMESTAMP(3),
    "reminded_90_at" TIMESTAMP(3),
    "reminded_95_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "handoff_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_rule_recipients" (
    "rule_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wrapped_release_key" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "handoff_rule_recipients_pkey" PRIMARY KEY ("rule_id","user_id")
);

-- CreateTable
CREATE TABLE "handoff_rule_items" (
    "rule_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "wrapped_file_key" TEXT NOT NULL,

    CONSTRAINT "handoff_rule_items_pkey" PRIMARY KEY ("rule_id","file_id")
);

-- CreateTable
CREATE TABLE "handoff_rule_shares" (
    "rule_id" TEXT NOT NULL,
    "witness_user_id" TEXT NOT NULL,
    "wrapped_share" TEXT NOT NULL,
    "share_index" INTEGER NOT NULL,

    CONSTRAINT "handoff_rule_shares_pkey" PRIMARY KEY ("rule_id","witness_user_id")
);

-- CreateIndex
CREATE INDEX "handoff_rules_owner_id_state_idx" ON "handoff_rules"("owner_id", "state");

-- CreateIndex
CREATE INDEX "handoff_rule_recipients_user_id_idx" ON "handoff_rule_recipients"("user_id");

-- CreateIndex
CREATE INDEX "handoff_rule_items_file_id_idx" ON "handoff_rule_items"("file_id");

-- AddForeignKey
ALTER TABLE "handoff_rules" ADD CONSTRAINT "handoff_rules_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rules" ADD CONSTRAINT "handoff_rules_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rules" ADD CONSTRAINT "handoff_rules_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rule_recipients" ADD CONSTRAINT "handoff_rule_recipients_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "handoff_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rule_recipients" ADD CONSTRAINT "handoff_rule_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rule_items" ADD CONSTRAINT "handoff_rule_items_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "handoff_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rule_items" ADD CONSTRAINT "handoff_rule_items_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rule_shares" ADD CONSTRAINT "handoff_rule_shares_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "handoff_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_rule_shares" ADD CONSTRAINT "handoff_rule_shares_witness_user_id_fkey" FOREIGN KEY ("witness_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A rule covers exactly one thing: a file or a folder. Prisma cannot express this, so it is added by hand.
ALTER TABLE "handoff_rules" ADD CONSTRAINT "handoff_rules_one_target_chk" CHECK (("file_id" IS NULL) <> ("folder_id" IS NULL));
