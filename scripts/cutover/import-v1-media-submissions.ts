import type { CutoverClient, CutoverStepResult } from "./types";

type CountRow = Record<string, string | number | null | undefined>;

export type ImportV1MediaSubmissionsOptions = Readonly<{
  actorUserAccountId: string;
}>;

function count(row: CountRow | undefined, key: string): number {
  const value = Number(row?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Cutover check returned an invalid ${key} count.`);
  }
  return value;
}

function rejectNonzero(row: CountRow | undefined, keys: readonly string[], scope: string) {
  const failures = keys.filter((key) => count(row, key) !== 0);
  if (failures.length > 0) throw new Error(`${scope} preflight failed: ${failures.join(", ")}.`);
}

async function insertedCount(client: CutoverClient, statement: string, values: unknown[] = []) {
  const result = await client.query(statement, values);
  return count(result.rows[0] as CountRow | undefined, "inserted_count");
}

export async function importV1MediaSubmissions(
  client: CutoverClient,
  options: ImportV1MediaSubmissionsOptions,
): Promise<readonly CutoverStepResult[]> {
  const preflight = await client.query(`
    select
      (select count(*) from public."Highlight")::text as highlight_source_count,
      (select count(*) from public."GalleryImage")::text as gallery_source_count,
      (select coalesce(sum(cardinality(gallery."imageUrl")), 0) from public."GalleryImage" gallery)::text as gallery_url_source_count,
      (select count(*) from public."PrivateAsset")::text as asset_source_count,
      (select count(*) from public."InhouseResultSubmission")::text as submission_source_count,
      (select count(*) from public."InhouseResultImage")::text as submission_image_source_count,
      (select count(*) from public."EventMatch" where "galleryImageId" is not null)::text as event_gallery_source_count,
      (select count(*) from public."DestructionTournament" where "galleryImageId" is not null)::text as destruction_gallery_source_count,
      case when (
        exists (select 1 from public."Highlight")
        or exists (select 1 from public."GalleryImage")
        or exists (select 1 from public."InhouseResultSubmission" where status in ('REGISTERED', 'REJECTED'))
      ) and not exists (
        select 1 from auth.user_accounts actor
         where actor.id = $1::uuid and actor.role in ('ADMIN', 'SUPER_ADMIN')
           and actor.status = 'APPROVED' and actor.deleted_at is null
      ) then 1 else 0 end::text as invalid_actor,
      (select count(*) from public."Highlight" highlight
        where highlight.id <= 0
          or char_length(btrim(highlight.title)) not between 1 and 120
          or char_length(btrim(highlight.description)) not between 1 and 4000
          or highlight."youtubeId" !~ '^[A-Za-z0-9_-]{11}$'
          or highlight."sortOrder" not between -100000 and 100000
          or highlight."thumbnailUrl" is not null and (
            char_length(highlight."thumbnailUrl") not between 1 and 2048
            or highlight."thumbnailUrl" ~ '[[:cntrl:]]'
            or highlight."thumbnailUrl" !~ '^(https://|/images/)'
          )
      )::text as invalid_highlights,
      (select count(*) from public."GalleryImage" gallery
        where gallery.id <= 0
          or char_length(btrim(gallery.title)) not between 1 and 120
          or char_length(btrim(gallery.description)) not between 1 and 4000
          or cardinality(gallery."imageUrl") not between 1 and 5
          or exists (
            select 1 from unnest(gallery."imageUrl") url
             where char_length(url) not between 1 and 2048
                or url ~ '[[:cntrl:]]' or url !~ '^(https://|/images/)'
          )
          or cardinality(gallery."imageUrl") <> (
            select count(distinct url) from unnest(gallery."imageUrl") url
          )
      )::text as invalid_galleries,
      (select count(*) from public."PrivateAsset" asset
        where asset.id <= 0 or asset.provider not in ('VERCEL_BLOB', 'VERCEL_BLOB_PRIVATE')
          or char_length(asset."storageKey") not between 1 and 255
          or asset."storageKey" ~ '[[:cntrl:]]'
          or asset."storageKey" like '/%'
          or position(chr(92) in asset."storageKey") > 0
          or '..' = any(string_to_array(asset."storageKey", '/'))
          or asset."mimeType" not in ('image/png', 'image/jpeg', 'image/webp')
          or asset."byteSize" not between 1 and 8388608
          or asset.width is null or asset.height is null
          or asset.width not between 16 and 4096 or asset.height not between 16 and 4096
          or asset.width::bigint * asset.height::bigint > 16777216
          or asset.sha256 !~ '^[0-9A-Fa-f]{64}$'
          or char_length(asset.purpose) not between 1 and 64
      )::text as invalid_assets,
      (select count(*) from public."InhouseResultSubmission" submission
        where submission.id <= 0
          or char_length(submission."publicCode") not between 12 and 24
          or char_length(btrim(submission.organizer)) not between 1 and 100
          or submission."seriesNumber" <= 0
          or submission."expectedGameCount" not in (2, 3)
          or submission."sourceMessageHash" is null
          or submission."sourceMessageHash" !~ '^[0-9A-Fa-f]{64}$'
          or submission.status not in ('AWAITING_UPLOAD', 'PENDING_REVIEW', 'IN_REVIEW', 'REGISTERED', 'REJECTED', 'CANCELLED')
          or submission.status = 'REJECTED' and char_length(btrim(coalesce(submission."rejectionReason", ''))) not between 3 and 1000
          or submission.status = 'REGISTERED' and submission."matchSeriesId" is null
          or submission.status <> 'REGISTERED' and submission."matchSeriesId" is not null
          or coalesce(char_length(submission."parsedData"->>'note'), 0) > 1000
      )::text as invalid_submissions,
      (select count(*) from public."InhouseResultSubmission" submission
        left join competition.seasons season
          on season.id = pg_temp.klol_legacy_uuid('competition.seasons', submission."seasonId")
        left join team_tools.team_balance_drafts draft
          on draft.id = pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', submission."teamBalanceDraftId")
        left join competition.match_series series
          on series.id = pg_temp.klol_legacy_uuid('competition.match_series', submission."matchSeriesId")
        left join auth.user_accounts owner on owner.legacy_id = submission."submittedByUserAccountId"
        left join auth.user_accounts reviewer on reviewer.legacy_id = submission."reviewedById"
        where submission."seasonId" is not null and season.id is null
           or submission."teamBalanceDraftId" is not null and draft.id is null
           or submission."matchSeriesId" is not null and series.id is null
           or submission."submittedByUserAccountId" is not null and owner.id is null
           or submission."reviewedById" is not null and reviewer.id is null
      )::text as missing_submission_relations,
      (select count(*) from public."InhouseResultImage" image
        join public."InhouseResultSubmission" submission on submission.id = image."submissionId"
        left join public."PrivateAsset" asset on asset.id = image."privateAssetId"
        where image.id <= 0 or asset.id is null
          or image."gameNumber" not between 1 and least(submission."expectedGameCount", 5)
          or image."ocrStatus" not in ('NOT_REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED')
          or image."ocrStatus" = 'SUCCEEDED' and image."ocrResultJson" is null
          or image."ocrStatus" <> 'SUCCEEDED' and image."ocrResultJson" is not null
          or image."ocrResultJson" is not null and octet_length(image."ocrResultJson"::text) > 65536
      )::text as invalid_submission_images,
      (select count(*) from (
        select submission.id
          from public."InhouseResultSubmission" submission
          left join public."InhouseResultImage" image on image."submissionId" = submission.id
         group by submission.id, submission.status, submission."expectedGameCount"
        having count(image.id) > submission."expectedGameCount"
          or submission.status in ('PENDING_REVIEW', 'IN_REVIEW', 'REGISTERED')
             and count(image.id) <> submission."expectedGameCount"
          or submission.status = 'AWAITING_UPLOAD' and count(image.id) >= submission."expectedGameCount"
      ) invalid_counts)::text as inconsistent_submission_image_counts,
      (select count(*) from public."EventMatch" event
        left join public."GalleryImage" gallery on gallery.id = event."galleryImageId"
        where event."galleryImageId" is not null and gallery.id is null
      )::text as missing_event_galleries,
      (select count(*) from public."DestructionTournament" tournament
        left join public."GalleryImage" gallery on gallery.id = tournament."galleryImageId"
        where tournament."galleryImageId" is not null and gallery.id is null
      )::text as missing_destruction_galleries
  `, [options.actorUserAccountId]);
  const audit = preflight.rows[0] as CountRow | undefined;
  rejectNonzero(audit, [
    "invalid_actor",
    "invalid_highlights",
    "invalid_galleries",
    "invalid_assets",
    "invalid_submissions",
    "missing_submission_relations",
    "invalid_submission_images",
    "inconsistent_submission_image_counts",
    "missing_event_galleries",
    "missing_destruction_galleries",
  ], "V1 media and submissions");

  const insertedAssets = await insertedCount(client, `
    with inserted as (
      insert into assets.private_assets (
        id, created_by_user_account_id, ingest_source, storage_provider, storage_key,
        original_file_name, content_type, byte_size, width, height, sha256, purpose,
        status, ready_at, delete_requested_at, created_at
      )
      select pg_temp.klol_legacy_uuid('assets.private_assets', asset.id), null, 'JOB',
             'VERCEL_BLOB_PRIVATE', asset."storageKey", asset."originalFileName",
             asset."mimeType", asset."byteSize", asset.width, asset.height,
             decode(lower(asset.sha256), 'hex'), asset.purpose,
             case when asset."deletedAt" is null and asset."expiresAt" is null
               then 'READY'::assets.private_asset_status else 'DELETE_PENDING'::assets.private_asset_status end,
             case when asset."deletedAt" is null and asset."expiresAt" is null
               then asset."createdAt" at time zone 'UTC' else null end,
             case when asset."deletedAt" is null and asset."expiresAt" is null
               then null else coalesce(asset."deletedAt", asset."expiresAt", asset."createdAt") at time zone 'UTC' end,
             asset."createdAt" at time zone 'UTC'
        from public."PrivateAsset" asset order by asset.id
      on conflict (id) do nothing returning 1
    ) select count(*)::text as inserted_count from inserted
  `);

  const insertedSubmissions = await insertedCount(client, `
    with inserted as (
      insert into competition.match_submissions (
        id, legacy_id, public_code, owner_user_account_id, season_id, title, organizer,
        series_number, note, played_on, started_at, started_at_offset_minutes,
        expected_game_count, team_balance_draft_id, source, source_reference_hash,
        provenance_json, reviewed_result_json, status, public_review_reason,
        reviewed_by_user_account_id, reviewed_at, cancelled_at, approved_match_series_id,
        revision, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.match_submissions', submission.id), submission.id,
             submission."publicCode",
             case when submission."submittedByUserAccountId" is null then null
               else pg_temp.klol_legacy_uuid('auth.user_accounts', submission."submittedByUserAccountId") end,
             case when submission."seasonId" is null then null
               else pg_temp.klol_legacy_uuid('competition.seasons', submission."seasonId") end,
             left(format('내전 결과 %s회 · %s', submission."seriesNumber", btrim(submission.organizer)), 160),
             btrim(submission.organizer), submission."seriesNumber",
             nullif(submission."parsedData"->>'note', ''),
             ((submission."matchDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
             null, null, submission."expectedGameCount",
             case when submission."teamBalanceDraftId" is null then null
               else pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', submission."teamBalanceDraftId") end,
             case when submission."submittedByUserAccountId" is null then 'KAKAO'::competition.match_submission_source
               else 'WEB'::competition.match_submission_source end,
             decode(lower(submission."sourceMessageHash"), 'hex'),
             jsonb_strip_nulls(jsonb_build_object(
               'legacyTemplateId', submission."templateId",
               'legacyTemplateVersion', submission."templateVersion",
               'legacyStatus', submission.status
             )), null,
             case submission.status
               when 'REGISTERED' then 'APPROVED'::competition.match_submission_status
               when 'IN_REVIEW' then 'PENDING_REVIEW'::competition.match_submission_status
               else submission.status::competition.match_submission_status end,
             case when submission.status = 'REJECTED' then btrim(submission."rejectionReason") else null end,
             case when submission.status in ('REGISTERED', 'REJECTED')
               then coalesce(
                 case when submission."reviewedById" is null then null
                   else pg_temp.klol_legacy_uuid('auth.user_accounts', submission."reviewedById") end,
                 $1::uuid
               ) else null end,
             case when submission.status in ('REGISTERED', 'REJECTED')
               then coalesce(submission."reviewedAt", submission."updatedAt") at time zone 'UTC' else null end,
             case when submission.status = 'CANCELLED' then submission."updatedAt" at time zone 'UTC' else null end,
             case when submission.status = 'REGISTERED'
               then pg_temp.klol_legacy_uuid('competition.match_series', submission."matchSeriesId") else null end,
             0, submission."createdAt" at time zone 'UTC', submission."updatedAt" at time zone 'UTC'
        from public."InhouseResultSubmission" submission order by submission.id
      on conflict (id) do nothing returning 1
    ) select count(*)::text as inserted_count from inserted
  `, [options.actorUserAccountId]);

  const insertedSubmissionImages = await insertedCount(client, `
    with inserted as (
      insert into competition.match_submission_images (
        id, submission_id, private_asset_id, game_number, ocr_status,
        ocr_candidate_json, ocr_error_code, revision, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.match_submission_images', image.id),
             pg_temp.klol_legacy_uuid('competition.match_submissions', image."submissionId"),
             pg_temp.klol_legacy_uuid('assets.private_assets', image."privateAssetId"),
             image."gameNumber", image."ocrStatus"::competition.match_submission_image_ocr_status,
             case when image."ocrStatus" = 'SUCCEEDED' then image."ocrResultJson" else null end,
             case when image."ocrStatus" = 'FAILED' then 'V1_OCR_FAILED' else null end,
             0, image."createdAt" at time zone 'UTC', image."updatedAt" at time zone 'UTC'
        from public."InhouseResultImage" image order by image.id
      on conflict (id) do nothing returning 1
    ) select count(*)::text as inserted_count from inserted
  `);

  const insertedHighlights = await insertedCount(client, `
    with inserted as (
      insert into media.highlights (
        id, legacy_id, revision, title, description, youtube_id, thumbnail_asset_id,
        legacy_thumbnail_url, status, sort_order, created_by_user_account_id,
        updated_by_user_account_id, published_at, archived_at, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('media.highlights', highlight.id), highlight.id, 0,
             btrim(highlight.title), btrim(highlight.description), highlight."youtubeId", null,
             highlight."thumbnailUrl",
             case when highlight."isPublished" then 'PUBLISHED'::media.publication_status
               else 'DRAFT'::media.publication_status end,
             highlight."sortOrder", $1::uuid, $1::uuid,
             case when highlight."isPublished" then highlight."createdAt" at time zone 'UTC' else null end,
             null, highlight."createdAt" at time zone 'UTC', highlight."updatedAt" at time zone 'UTC'
        from public."Highlight" highlight order by highlight.id
      on conflict (id) do nothing returning 1
    ) select count(*)::text as inserted_count from inserted
  `, [options.actorUserAccountId]);

  const insertedGalleries = await insertedCount(client, `
    with inserted as (
      insert into media.galleries (
        id, legacy_id, revision, title, description, show_on_home, status,
        created_by_user_account_id, updated_by_user_account_id, published_at,
        archived_at, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('media.galleries', gallery.id), gallery.id, 0,
             btrim(gallery.title), btrim(gallery.description), gallery."showOnHome", 'PUBLISHED',
             $1::uuid, $1::uuid, gallery."createdAt" at time zone 'UTC', null,
             gallery."createdAt" at time zone 'UTC', gallery."updatedAt" at time zone 'UTC'
        from public."GalleryImage" gallery order by gallery.id
      on conflict (id) do nothing returning 1
    ) select count(*)::text as inserted_count from inserted
  `, [options.actorUserAccountId]);

  const insertedGalleryUrls = await insertedCount(client, `
    with inserted as (
      insert into media.gallery_external_images (gallery_id, ordinal, source_url)
      select pg_temp.klol_legacy_uuid('media.galleries', gallery.id), image.ordinality - 1, image.url
        from public."GalleryImage" gallery
        cross join lateral unnest(gallery."imageUrl") with ordinality image(url, ordinality)
       order by gallery.id, image.ordinality
      on conflict (gallery_id, ordinal) do nothing returning 1
    ) select count(*)::text as inserted_count from inserted
  `);

  const linkedEvents = await insertedCount(client, `
    with linked as (
      update competition.event_competitions target
         set gallery_id = pg_temp.klol_legacy_uuid('media.galleries', source."galleryImageId")
        from public."EventMatch" source
       where source."galleryImageId" is not null
         and target.id = pg_temp.klol_legacy_uuid('competition.event_competitions', source.id)
         and target.gallery_id is null
      returning 1
    ) select count(*)::text as inserted_count from linked
  `);

  const linkedDestructions = await insertedCount(client, `
    with linked as (
      update competition.destruction_competitions target
         set gallery_id = pg_temp.klol_legacy_uuid('media.galleries', source."galleryImageId"),
             aggregate_json = jsonb_set(
               target.aggregate_json, '{galleryId}',
               to_jsonb(pg_temp.klol_legacy_uuid('media.galleries', source."galleryImageId")::text), true
             )
        from public."DestructionTournament" source
       where source."galleryImageId" is not null
         and target.id = pg_temp.klol_legacy_uuid('competition.destruction_competitions', source.id)
         and target.gallery_id is null
      returning 1
    ) select count(*)::text as inserted_count from linked
  `);

  const reconciliation = await client.query(`
    select
      (select count(*) from public."Highlight" source join media.highlights target
        on target.id = pg_temp.klol_legacy_uuid('media.highlights', source.id)
      )::text as target_highlight_count,
      (select count(*) from public."GalleryImage" source join media.galleries target
        on target.id = pg_temp.klol_legacy_uuid('media.galleries', source.id)
      )::text as target_gallery_count,
      (select count(*) from public."GalleryImage" source
        cross join lateral unnest(source."imageUrl") with ordinality image(url, ordinality)
        join media.gallery_external_images target
          on target.gallery_id = pg_temp.klol_legacy_uuid('media.galleries', source.id)
         and target.ordinal = image.ordinality - 1
      )::text as target_gallery_url_count,
      (select count(*) from public."PrivateAsset" source join assets.private_assets target
        on target.id = pg_temp.klol_legacy_uuid('assets.private_assets', source.id)
      )::text as target_asset_count,
      (select count(*) from public."InhouseResultSubmission" source join competition.match_submissions target
        on target.id = pg_temp.klol_legacy_uuid('competition.match_submissions', source.id)
      )::text as target_submission_count,
      (select count(*) from public."InhouseResultImage" source join competition.match_submission_images target
        on target.id = pg_temp.klol_legacy_uuid('competition.match_submission_images', source.id)
      )::text as target_submission_image_count,
      (select count(*) from public."EventMatch" source join competition.event_competitions target
        on target.id = pg_temp.klol_legacy_uuid('competition.event_competitions', source.id)
       where source."galleryImageId" is not null
         and target.gallery_id = pg_temp.klol_legacy_uuid('media.galleries', source."galleryImageId")
      )::text as target_event_gallery_count,
      (select count(*) from public."DestructionTournament" source join competition.destruction_competitions target
        on target.id = pg_temp.klol_legacy_uuid('competition.destruction_competitions', source.id)
       where source."galleryImageId" is not null
         and target.gallery_id = pg_temp.klol_legacy_uuid('media.galleries', source."galleryImageId")
         and target.aggregate_json->>'galleryId' = pg_temp.klol_legacy_uuid('media.galleries', source."galleryImageId")::text
      )::text as target_destruction_gallery_count,
      (select count(*) from public."Highlight" source join media.highlights target
        on target.id = pg_temp.klol_legacy_uuid('media.highlights', source.id)
       where target.legacy_id <> source.id or target.title <> btrim(source.title)
          or target.description <> btrim(source.description) or target.youtube_id <> source."youtubeId"
          or target.legacy_thumbnail_url is distinct from source."thumbnailUrl"
          or target.sort_order <> source."sortOrder"
          or target.status::text <> case when source."isPublished" then 'PUBLISHED' else 'DRAFT' end
      )::text as mismatched_highlights,
      (select count(*) from public."GalleryImage" source join media.galleries target
        on target.id = pg_temp.klol_legacy_uuid('media.galleries', source.id)
       where target.legacy_id <> source.id or target.title <> btrim(source.title)
          or target.description <> btrim(source.description) or target.show_on_home <> source."showOnHome"
          or target.status <> 'PUBLISHED'
      )::text as mismatched_galleries,
      (select count(*) from public."GalleryImage" source
        cross join lateral unnest(source."imageUrl") with ordinality image(url, ordinality)
        join media.gallery_external_images target
          on target.gallery_id = pg_temp.klol_legacy_uuid('media.galleries', source.id)
         and target.ordinal = image.ordinality - 1
       where target.source_url <> image.url
      )::text as mismatched_gallery_urls,
      (select count(*) from public."PrivateAsset" source join assets.private_assets target
        on target.id = pg_temp.klol_legacy_uuid('assets.private_assets', source.id)
       where target.storage_provider <> 'VERCEL_BLOB_PRIVATE'
          or target.storage_key <> source."storageKey" or target.original_file_name is distinct from source."originalFileName"
          or target.content_type <> source."mimeType" or target.byte_size <> source."byteSize"
          or target.width <> source.width or target.height <> source.height
          or target.sha256 <> decode(lower(source.sha256), 'hex') or target.purpose <> source.purpose
          or target.status::text <> case when source."deletedAt" is null and source."expiresAt" is null
            then 'READY' else 'DELETE_PENDING' end
          or target.ready_at is distinct from case when source."deletedAt" is null and source."expiresAt" is null
            then source."createdAt" at time zone 'UTC' else null end
          or target.delete_requested_at is distinct from case when source."deletedAt" is null and source."expiresAt" is null
            then null else coalesce(source."deletedAt", source."expiresAt", source."createdAt") at time zone 'UTC' end
      )::text as mismatched_assets,
      (select count(*) from public."InhouseResultSubmission" source join competition.match_submissions target
        on target.id = pg_temp.klol_legacy_uuid('competition.match_submissions', source.id)
       where target.legacy_id <> source.id or target.public_code <> source."publicCode"
          or target.organizer <> btrim(source.organizer) or target.series_number <> source."seriesNumber"
          or target.expected_game_count <> source."expectedGameCount"
          or target.source_reference_hash <> decode(lower(source."sourceMessageHash"), 'hex')
          or target.owner_user_account_id is distinct from case when source."submittedByUserAccountId" is null then null
            else pg_temp.klol_legacy_uuid('auth.user_accounts', source."submittedByUserAccountId") end
          or target.season_id is distinct from case when source."seasonId" is null then null
            else pg_temp.klol_legacy_uuid('competition.seasons', source."seasonId") end
          or target.team_balance_draft_id is distinct from case when source."teamBalanceDraftId" is null then null
            else pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', source."teamBalanceDraftId") end
          or target.source::text <> case when source."submittedByUserAccountId" is null then 'KAKAO' else 'WEB' end
          or target.status::text <> case source.status
            when 'REGISTERED' then 'APPROVED' when 'IN_REVIEW' then 'PENDING_REVIEW' else source.status end
          or target.approved_match_series_id is distinct from case when source.status = 'REGISTERED'
            then pg_temp.klol_legacy_uuid('competition.match_series', source."matchSeriesId") else null end
      )::text as mismatched_submissions,
      (select count(*) from public."InhouseResultImage" source join competition.match_submission_images target
        on target.id = pg_temp.klol_legacy_uuid('competition.match_submission_images', source.id)
       where target.submission_id <> pg_temp.klol_legacy_uuid('competition.match_submissions', source."submissionId")
          or target.private_asset_id <> pg_temp.klol_legacy_uuid('assets.private_assets', source."privateAssetId")
          or target.game_number <> source."gameNumber" or target.ocr_status::text <> source."ocrStatus"
          or target.ocr_candidate_json is distinct from case when source."ocrStatus" = 'SUCCEEDED'
            then source."ocrResultJson" else null end
          or target.ocr_error_code is distinct from case when source."ocrStatus" = 'FAILED'
            then 'V1_OCR_FAILED' else null end
      )::text as mismatched_submission_images
  `);
  const finalAudit = reconciliation.rows[0] as CountRow | undefined;
  rejectNonzero(finalAudit, [
    "mismatched_highlights",
    "mismatched_galleries",
    "mismatched_gallery_urls",
    "mismatched_assets",
    "mismatched_submissions",
    "mismatched_submission_images",
  ], "V1 media and submissions reconciliation");

  const results: CutoverStepResult[] = [
    { name: "assets.private_assets", sourceCount: count(audit, "asset_source_count"), targetCount: count(finalAudit, "target_asset_count"), insertedCount: insertedAssets },
    { name: "competition.match_submissions", sourceCount: count(audit, "submission_source_count"), targetCount: count(finalAudit, "target_submission_count"), insertedCount: insertedSubmissions },
    { name: "competition.match_submission_images", sourceCount: count(audit, "submission_image_source_count"), targetCount: count(finalAudit, "target_submission_image_count"), insertedCount: insertedSubmissionImages },
    { name: "media.highlights", sourceCount: count(audit, "highlight_source_count"), targetCount: count(finalAudit, "target_highlight_count"), insertedCount: insertedHighlights },
    { name: "media.galleries", sourceCount: count(audit, "gallery_source_count"), targetCount: count(finalAudit, "target_gallery_count"), insertedCount: insertedGalleries },
    { name: "media.gallery_external_images", sourceCount: count(audit, "gallery_url_source_count"), targetCount: count(finalAudit, "target_gallery_url_count"), insertedCount: insertedGalleryUrls },
    { name: "competition.event_gallery_links", sourceCount: count(audit, "event_gallery_source_count"), targetCount: count(finalAudit, "target_event_gallery_count"), insertedCount: linkedEvents },
    { name: "competition.destruction_gallery_links", sourceCount: count(audit, "destruction_gallery_source_count"), targetCount: count(finalAudit, "target_destruction_gallery_count"), insertedCount: linkedDestructions },
  ];
  if (results.some((result) => result.sourceCount !== result.targetCount)) {
    throw new Error("V1 media and submissions reconciliation failed: source and target counts differ.");
  }
  return Object.freeze(results);
}
