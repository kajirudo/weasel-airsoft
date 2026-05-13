-- migration 015: atomic commit_tactics_score RPC
-- タクティクスモードのスコア確定をアトミックに処理する Postgres 関数。
-- control_since のリセットとスコア加算を単一トランザクション内で行い、
-- 並行呼び出しによる二重カウントを防ぐ。

create or replace function public.commit_tactics_score(p_game_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  -- SCORE_SECS_PER_POINT = 10 (lib/game/constants.ts と同期)
  c_secs_per_point constant integer := 10;
  v_add_red  integer := 0;
  v_add_blue integer := 0;
  v_now      timestamptz := now();
  r          record;
  v_secs     integer;
  v_pts      integer;
begin
  -- 対象拠点を FOR UPDATE SKIP LOCKED でロック（並行処理を安全に排除）
  for r in
    select id, controlled_by, control_since
    from public.game_objectives
    where game_id = p_game_id
      and type = 'control_point'
      and controlled_by <> 'none'
      and control_since is not null
    for update skip locked
  loop
    v_secs := floor(extract(epoch from (v_now - r.control_since)));
    v_pts  := floor(v_secs::numeric / c_secs_per_point);
    if v_pts <= 0 then
      continue;
    end if;

    if r.controlled_by = 'red' then
      v_add_red := v_add_red + v_pts;
    elsif r.controlled_by = 'blue' then
      v_add_blue := v_add_blue + v_pts;
    end if;

    -- control_since をリセット（次回 tick で二重カウントしないため）
    update public.game_objectives
    set control_since = v_now
    where id = r.id;
  end loop;

  -- スコアを加算
  if v_add_red > 0 or v_add_blue > 0 then
    update public.games
    set score_red  = coalesce(score_red,  0) + v_add_red,
        score_blue = coalesce(score_blue, 0) + v_add_blue
    where id = p_game_id;
  end if;
end;
$$;

-- 匿名ユーザーから直接呼び出せないようにする（Server Action 経由のみ）
revoke execute on function public.commit_tactics_score(uuid) from anon, authenticated;
grant  execute on function public.commit_tactics_score(uuid) to service_role;
