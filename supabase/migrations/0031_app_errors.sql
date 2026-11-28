-- 서버 에러 기록 (외부 서비스 없이 DB에 코드만 쌓는다)
-- 1) app_errors: 어디서(source)·무슨 에러(code)·누구(user_id)·작은 숫자 정보(detail)와 1분 단위로 합친 횟수
-- 2) report_app_error: 서버가 부르는 기록 함수. 어떤 경우에도 에러를 던지지 않는다.
-- 3) 30일 지난 행은 매일 지운다 (pg_cron이 있을 때만 등록, PGlite 테스트 호환)
-- 에러 메시지 원문·스택·요청 내용·대화 내용·토큰은 저장하지 않는다. 기록은 함수로만, 조회는 SQL Editor에서만.
begin;
set local lock_timeout = '5s';

create table public.app_errors (
  id bigint generated always as identity primary key,
  source text not null check (source ~ '^[a-z][a-z0-9_.]{1,63}$'),
  code text not null check (code ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  user_id uuid references public.members(user_id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 1024),
  count integer not null default 1 check (count >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
-- 묶음 찾기, 상한 세기, 30일 삭제, 회원 삭제 시 set null
create index app_errors_group on public.app_errors (source, code, first_seen_at desc);
create index app_errors_first_seen on public.app_errors (first_seen_at);
create index app_errors_user on public.app_errors (user_id) where user_id is not null;
alter table public.app_errors enable row level security;
revoke all on public.app_errors from public, anon, authenticated;

create function public.report_app_error(p_source text, p_code text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if p_source is null or p_code is null or p_source !~ '^[a-z][a-z0-9_.]{1,63}$' or p_code !~ '^[A-Za-z0-9_.:-]{1,64}$'
    or jsonb_typeof(d) <> 'object' or octet_length(d::text) > 1024 then return; end if;
  -- 로그인 없는 호출은 크론 작업자뿐이다. 공개 키로 아무 source나 쌓지 못하게 worker.* 만 받는다.
  if uid is null and p_source not like 'worker.%' then return; end if;
  -- 가입을 마치지 않은 계정은 회원 행이 없으므로 사용자 없이 기록한다.
  if uid is not null and not exists(select 1 from public.members where user_id = uid) then uid := null; end if;

  -- 같은 source·code·사용자 조합만 줄 세운다 (seed 31: 이 함수 전용).
  perform pg_advisory_xact_lock(hashtextextended(p_source || '|' || p_code || '|' || coalesce(uid::text, ''), 31));
  -- 묶음: 같은 조합이면서 "시작"이 1분 안인 행. 길게 이어지는 장애도 1분마다 끊겨 흐름이 보인다.
  update public.app_errors set count = count + 1, last_seen_at = now()
  where id = (select e.id from public.app_errors e
    where e.source = p_source and e.code = p_code and e.user_id is not distinct from uid
      and e.first_seen_at > now() - interval '1 minute'
    order by e.first_seen_at desc limit 1);
  if found then return; end if;

  -- 새 행 상한: 하루 5,000 / 1분 200 / 사용자 1분 30 / 로그인 없는 호출 1분 20 (넘치면 overflow 행에 숫자만)
  if (select count(*) from public.app_errors where first_seen_at > now() - interval '1 day' and source <> 'app_errors.overflow') >= 5000
    or (select count(*) from public.app_errors where first_seen_at > now() - interval '1 minute' and source <> 'app_errors.overflow') >= 200
    or (uid is not null and (select count(*) from public.app_errors where user_id = uid and first_seen_at > now() - interval '1 minute') >= 30)
    or (uid is null and (select count(*) from public.app_errors where user_id is null and source like 'worker.%' and first_seen_at > now() - interval '1 minute') >= 20)
  then
    perform pg_advisory_xact_lock(hashtextextended('app_errors.overflow', 31));
    update public.app_errors set count = count + 1, last_seen_at = now()
    where id = (select e.id from public.app_errors e where e.source = 'app_errors.overflow' and e.first_seen_at > now() - interval '1 minute'
      order by e.first_seen_at desc limit 1);
    if not found then insert into public.app_errors(source, code) values ('app_errors.overflow', 'dropped'); end if;
    return;
  end if;

  insert into public.app_errors(source, code, user_id, detail) values (p_source, p_code, uid, d);
exception when others then
  return; -- 에러 기록이 원래 요청을 깨뜨리지 않게 한다
end;
$$;
revoke all on function public.report_app_error(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.report_app_error(text, text, jsonb) to anon, authenticated;

create function public.purge_app_errors() returns void
language sql security definer set search_path = '' as $$
  delete from public.app_errors where first_seen_at < now() - interval '30 days';
$$;
revoke all on function public.purge_app_errors() from public, anon, authenticated;

-- pg_cron이 있는 환경(here-dev·운영)에서만 매일 00:35에 정리한다. 테스트(PGlite)는 등록만 건너뛴다.
do $$begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('here-app-errors-retention', '35 0 * * *', 'select public.purge_app_errors()')$cron$;
  end if;
end$$;

commit;

-- 되돌리기 (개발 DB): select cron.unschedule('here-app-errors-retention');
-- drop function public.report_app_error(text, text, jsonb), public.purge_app_errors(); drop table public.app_errors;
