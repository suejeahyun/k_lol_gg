import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { UsageEvent, UsageRange } from "../domain/usage";

export class PostgresUsageRepository {
  constructor(private readonly pool: Pool) {}

  async record(event: UsageEvent, visitorId: string, userId: string | null, now = new Date()): Promise<"saved" | "duplicate" | "limited"> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // One bounded, durable global bucket also serializes retries across serverless instances.
      const gate = await c.query(`UPDATE usage.collection SET
        bucket_count = CASE WHEN bucket_at <= $1::timestamptz - interval '1 minute' THEN 1 ELSE bucket_count + 1 END,
        bucket_at = CASE WHEN bucket_at <= $1::timestamptz - interval '1 minute' THEN $1 ELSE bucket_at END
        WHERE singleton AND (bucket_at <= $1::timestamptz - interval '1 minute' OR bucket_count < 6000)
        RETURNING bucket_count`, [now]);
      if (!gate.rowCount) { await c.query("ROLLBACK"); return "limited"; }
      if ((await c.query("SELECT 1 FROM usage.events WHERE id = $1", [event.id])).rowCount) {
        await c.query("COMMIT"); return "duplicate";
      }
      const state = await c.query<{ visit_id: string }>(`INSERT INTO usage.visitors
        (id, visit_id, user_account_id, last_seen_at, bucket_at, bucket_count) VALUES ($1,$2,$3,$4,$4,1)
        ON CONFLICT (id) DO UPDATE SET
          visit_id = CASE WHEN usage.visitors.last_seen_at <= $4::timestamptz - interval '30 minutes'
            OR usage.visitors.user_account_id IS DISTINCT FROM $3::uuid THEN $2 ELSE usage.visitors.visit_id END,
          user_account_id = $3, last_seen_at = $4,
          bucket_count = CASE WHEN usage.visitors.bucket_at <= $4::timestamptz - interval '1 minute' THEN 1 ELSE usage.visitors.bucket_count + 1 END,
          bucket_at = CASE WHEN usage.visitors.bucket_at <= $4::timestamptz - interval '1 minute' THEN $4 ELSE usage.visitors.bucket_at END
        WHERE usage.visitors.bucket_at <= $4::timestamptz - interval '1 minute' OR usage.visitors.bucket_count < 120
        RETURNING visit_id`, [visitorId, randomUUID(), userId, now]);
      if (!state.rowCount) { await c.query("COMMIT"); return "limited"; }
      await c.query(`INSERT INTO usage.events (id,visitor_id,visit_id,user_account_id,kind,route,target,occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [event.id, visitorId, state.rows[0].visit_id, userId, event.kind, event.route, event.target, now]);
      await c.query("UPDATE usage.collection SET first_event_at = COALESCE(first_event_at, $1) WHERE singleton", [now]);
      // Bounded retention work on the first accepted request of each minute.
      if (gate.rows[0].bucket_count === 1) {
        await c.query(`DELETE FROM usage.events WHERE id IN
          (SELECT id FROM usage.events WHERE occurred_at < $1::timestamptz - interval '180 days' ORDER BY occurred_at LIMIT 5000)`, [now]);
        await c.query(`DELETE FROM usage.visitors WHERE id IN
          (SELECT id FROM usage.visitors WHERE last_seen_at < $1::timestamptz - interval '90 days' ORDER BY last_seen_at LIMIT 1000)`, [now]);
      }
      await c.query("COMMIT");
      return "saved";
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }

  async report(range: UsageRange, excludedUsers: string[] = []) {
    const c = await this.pool.connect();
    const values = [range.start, range.end, excludedUsers];
    // Exclusions also remove previous activity after a test account is configured or promoted.
    const scope = `WITH scoped AS (
      SELECT e.* FROM usage.events e LEFT JOIN auth.user_accounts a ON a.id = e.user_account_id
      WHERE occurred_at >= $1 AND occurred_at < $2
      AND (e.user_account_id IS NULL OR (a.role = 'USER' AND a.deleted_at IS NULL AND NOT (a.id = ANY($3::uuid[]))))
    )`;
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const coverage = await c.query<{ firstEventAt: Date | null; latestEventAt: Date | null }>(`SELECT first_event_at AS "firstEventAt",
        (SELECT max(occurred_at) FROM usage.events) AS "latestEventAt" FROM usage.collection WHERE singleton`);
      const summary = await c.query<{ browsers: number; guests: number; members: number; visits: number; views: number; searches: number; registered: number; approved: number; activeApproved: number }>(`${scope}
        SELECT count(DISTINCT visitor_id)::int AS browsers, count(DISTINCT user_account_id)::int AS members,
        count(DISTINCT visitor_id) FILTER (WHERE user_account_id IS NULL)::int AS guests,
        count(DISTINCT visit_id)::int AS visits, count(*) FILTER (WHERE kind='page')::int AS views,
        count(*) FILTER (WHERE kind='search')::int AS searches,
        (SELECT count(*)::int FROM auth.user_accounts WHERE role='USER' AND deleted_at IS NULL AND NOT(id=ANY($3::uuid[]))) AS registered,
        (SELECT count(*)::int FROM auth.user_accounts WHERE role='USER' AND status='APPROVED' AND deleted_at IS NULL AND NOT(id=ANY($3::uuid[]))) AS approved,
        count(DISTINCT user_account_id) FILTER (WHERE user_account_id IN (SELECT id FROM auth.user_accounts WHERE status='APPROVED'))::int AS "activeApproved"
        FROM scoped`, values);
      const daily = await c.query<{ date: string; browsers: number; members: number; guests: number; visits: number; views: number }>(`${scope}, daily AS (
        SELECT (occurred_at AT TIME ZONE 'Asia/Seoul')::date AS day, count(DISTINCT visitor_id)::int AS browsers,
          count(DISTINCT user_account_id)::int AS members,
          count(DISTINCT visitor_id) FILTER (WHERE user_account_id IS NULL)::int AS guests,
          count(DISTINCT visit_id)::int AS visits, count(*) FILTER (WHERE kind='page')::int AS views
        FROM scoped GROUP BY 1)
        SELECT to_char(d,'YYYY-MM-DD') AS date, COALESCE(browsers,0) AS browsers, COALESCE(members,0) AS members,
          COALESCE(guests,0) AS guests, COALESCE(visits,0) AS visits, COALESCE(views,0) AS views
        FROM generate_series(($1::timestamptz AT TIME ZONE 'Asia/Seoul')::date,
          ($2::timestamptz AT TIME ZONE 'Asia/Seoul')::date - 1, interval '1 day') d
        LEFT JOIN daily ON daily.day=d::date ORDER BY d DESC`, values);
      const monthly = await c.query<{ month: string; members: number; visits: number; averageVisits: number; medianVisits: number; averageDays: number; returningMembers: number }>(`${scope}, per_member AS (
        SELECT to_char(occurred_at AT TIME ZONE 'Asia/Seoul','YYYY-MM') AS month, user_account_id,
          count(DISTINCT visit_id)::int AS visits, count(DISTINCT (occurred_at AT TIME ZONE 'Asia/Seoul')::date)::int AS days
        FROM scoped WHERE user_account_id IS NOT NULL GROUP BY 1,2)
        SELECT month, count(*)::int AS members, sum(visits)::int AS visits,
          avg(visits)::float8 AS "averageVisits", percentile_cont(0.5) WITHIN GROUP (ORDER BY visits) AS "medianVisits",
          avg(days)::float8 AS "averageDays", count(*) FILTER (WHERE days>=2)::int AS "returningMembers"
        FROM per_member GROUP BY month ORDER BY month DESC`, values);
      const popular = await c.query<{ kind: string; route: string; target: string | null; events: number; browsers: number; members: number }>(`${scope}, counts AS (
        SELECT kind,route,target,count(*)::int AS events,count(DISTINCT visitor_id)::int AS browsers,
          count(DISTINCT user_account_id)::int AS members FROM scoped
        GROUP BY kind,route,target), ranked AS (
          SELECT *,row_number() OVER (PARTITION BY kind ORDER BY events DESC,route,target) AS rank FROM counts)
        SELECT kind,route,target,events,browsers,members FROM ranked WHERE rank<=10 ORDER BY events DESC,route,kind,target`, values);
      const paths = await c.query<{ from: string; to: string; transitions: number; browsers: number }>(`${scope}, steps AS (
        SELECT visitor_id,route,lag(route) OVER (PARTITION BY visit_id ORDER BY occurred_at,id) AS previous
        FROM scoped WHERE kind='page')
        SELECT previous AS "from", route AS "to",count(*)::int AS transitions,count(DISTINCT visitor_id)::int AS browsers
        FROM steps WHERE previous IS NOT NULL AND previous<>route GROUP BY previous,route ORDER BY transitions DESC,previous,route LIMIT 10`, values);
      await c.query("COMMIT");
      return { coverage: coverage.rows[0], summary: summary.rows[0], daily: daily.rows, monthly: monthly.rows, popular: popular.rows, paths: paths.rows };
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }
}
export type UsageReport = Awaited<ReturnType<PostgresUsageRepository["report"]>>;
