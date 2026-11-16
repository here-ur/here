-- Distinguish legacy user-fact extraction from full-dialogue summaries.
create or replace function public.finish_memory(p_id uuid,p_lease uuid,p_summary text,p_embedding extensions.vector,p_summary_model text,p_prompt_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.memory_is_enabled() or p_summary is null or char_length(p_summary)>902
    or char_length(p_summary_model)>100 or (p_prompt_version is null or p_prompt_version not in ('memory-v1','conversation-v1')) then return false; end if;
  if p_summary<>'' and (p_embedding is null or extensions.vector_dims(p_embedding)<>1536 or extensions.vector_norm(p_embedding)=0) then return false; end if;
  update public.conversation_memories set status=case when p_summary='' then 'skipped' else 'ready' end,
    summary=p_summary,embedding=case when p_summary='' then null else p_embedding end,
    summary_model=p_summary_model,prompt_version=p_prompt_version,updated_at=now()
    where id=p_id and user_id=auth.uid() and lease=p_lease and status='pending';
  return found;
end;
$$;

