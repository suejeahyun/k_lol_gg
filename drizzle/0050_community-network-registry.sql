CREATE SCHEMA "community_network";
--> statement-breakpoint
CREATE TABLE "community_network"."command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_json" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "community_network_receipt_key" CHECK (octet_length("community_network"."command_receipts"."key_hash") = 32),
	CONSTRAINT "community_network_receipt_request" CHECK (octet_length("community_network"."command_receipts"."request_hash") = 32),
	CONSTRAINT "community_network_receipt_revision" CHECK ("community_network"."command_receipts"."revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "community_network_receipt_expiry" CHECK ("community_network"."command_receipts"."expires_at" > "community_network"."command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "community_network"."registry_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"updated_by_user_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_network_state_singleton" CHECK ("community_network"."registry_state"."id" = 1),
	CONSTRAINT "community_network_state_revision" CHECK ("community_network"."registry_state"."revision" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "community_network"."communities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"origin" varchar(300) NOT NULL,
	"description" varchar(600) NOT NULL,
	"state" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_network_community_slug" CHECK ("community_network"."communities"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "community_network_community_name" CHECK (char_length("community_network"."communities"."name") > 0),
	CONSTRAINT "community_network_community_origin" CHECK ("community_network"."communities"."origin" LIKE 'https://%'),
	CONSTRAINT "community_network_community_state" CHECK ("community_network"."communities"."state" IN ('DRAFT', 'LISTED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "community_network"."rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"purpose" varchar(16) NOT NULL,
	"data_group_key" varchar(64) NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_network_room_name" CHECK (char_length("community_network"."rooms"."display_name") > 0),
	CONSTRAINT "community_network_room_purpose" CHECK ("community_network"."rooms"."purpose" IN ('CHAT', 'RECRUIT', 'EVENT', 'NOTICE')),
	CONSTRAINT "community_network_room_data_group" CHECK ("community_network"."rooms"."data_group_key" ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$')
);
--> statement-breakpoint
ALTER TABLE "community_network"."command_receipts" ADD CONSTRAINT "command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_network"."registry_state" ADD CONSTRAINT "registry_state_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_network"."rooms" ADD CONSTRAINT "rooms_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_network"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_network_receipt_actor_key_uidx" ON "community_network"."command_receipts" USING btree ("actor_user_account_id","key_hash");--> statement-breakpoint
CREATE INDEX "community_network_receipt_expires_idx" ON "community_network"."command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_network_community_slug_uidx" ON "community_network"."communities" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "community_network_community_origin_uidx" ON "community_network"."communities" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "community_network_community_state_idx" ON "community_network"."communities" USING btree ("state");--> statement-breakpoint
CREATE INDEX "community_network_room_community_idx" ON "community_network"."rooms" USING btree ("community_id");