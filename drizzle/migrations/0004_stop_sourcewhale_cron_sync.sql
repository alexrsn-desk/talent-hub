do $$
begin
  perform cron.unschedule(jobid)
    from cron.job
   where jobname in ('sourcewhale-hourly-sync', 'sourcewhale-poll-every-15min');
exception when others then
  raise notice 'could not unschedule sourcewhale cron jobs: %', sqlerrm;
end $$;