import type { Pool } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Isolated browser-QA boundary only. It never runs against an operational database. */
export async function prepareTeamBalanceCaptureFixture(
  database: Pick<Pool, "query">,
  actorUserAccountId: string,
): Promise<string> {
  if (!UUID.test(actorUserAccountId)) throw new Error("Browser QA actor must be a canonical UUID.");
  const result = await database.query<{ value: string }>(`
    with candidate as (
      select d.id, c.signature
        from team_tools.team_balance_drafts d
        join team_tools.team_balance_draft_candidates c
          on c.draft_id = d.id
         and c.evaluation_round = d.evaluation_round
         and c.source = 'AUTO'
         and c.rank = 1
       where jsonb_typeof(c.assignments_json) = 'array'
         and jsonb_array_length(c.assignments_json) = 10
         and d.status <> 'ARCHIVED'
         and (select count(*) from team_tools.team_balance_draft_participants p where p.draft_id = d.id) = 10
         and (select count(distinct assignment->>'playerId') from jsonb_array_elements(c.assignments_json) assignment) = 10
         and not exists (
           select 1
             from jsonb_array_elements(c.assignments_json) assignment
            where assignment->>'team' not in ('RED', 'BLUE')
               or assignment->>'position' not in ('TOP', 'JGL', 'MID', 'ADC', 'SUP')
               or not exists (
                 select 1
                   from team_tools.team_balance_draft_participants p
                  where p.draft_id = d.id
                    and p.player_id::text = assignment->>'playerId'
               )
         )
         and (select count(distinct concat(assignment->>'team', ':', assignment->>'position'))
                from jsonb_array_elements(c.assignments_json) assignment) = 10
       order by d.updated_at desc, d.id
       limit 1
    )
    update team_tools.team_balance_drafts d
       set owner_user_account_id = $1,
           status = 'SAVED',
           selected_candidate_source = 'AUTO',
           selected_candidate_signature = candidate.signature,
           saved_at = coalesce(d.saved_at, clock_timestamp()),
           revision = d.revision + 1,
           updated_by_user_account_id = $1,
           updated_at = clock_timestamp()
      from candidate
     where d.id = candidate.id
    returning d.id::text as value`, [actorUserAccountId]);
  const value = result.rows[0]?.value;
  if (!value || !UUID.test(value)) {
    throw new Error("Browser QA fixture is missing: complete team balance draft with a current automatic candidate.");
  }
  return value;
}
