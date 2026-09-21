ALTER TYPE "competition"."season_inhouse_round_status" ADD VALUE 'CLOSED';--> statement-breakpoint
ALTER TABLE "competition"."season_applications" DROP CONSTRAINT "season_applications_review_consistency";--> statement-breakpoint
DROP INDEX "competition"."season_kakao_pending_slot_uidx";--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD COLUMN "source_display_name" varchar(100);--> statement-breakpoint
ALTER TABLE "competition"."season_kakao_pending_applications" ADD COLUMN "link_reason" varchar(16);--> statement-breakpoint
CREATE UNIQUE INDEX "season_kakao_pending_active_slot_uidx" ON "competition"."season_kakao_pending_applications" USING btree ("season_id","apply_date","recruit_no","slot_no","source_room_id_hash","source_mode") WHERE "competition"."season_kakao_pending_applications"."status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD CONSTRAINT "season_applications_review_consistency" CHECK ((
        ("competition"."season_applications"."status" IN ('REJECTED', 'RESERVE', 'CONFIRMED') AND "competition"."season_applications"."reviewed_at" IS NOT NULL AND "competition"."season_applications"."reviewed_by_user_account_id" IS NOT NULL)
        OR (
          "competition"."season_applications"."status" IN ('APPLIED', 'CANCELLED', 'RESERVE')
          AND "competition"."season_applications"."review_note" IS NULL
          AND "competition"."season_applications"."reviewed_at" IS NULL
          AND "competition"."season_applications"."reviewed_by_user_account_id" IS NULL
        )
      ));