-- Enable only after provider consent, deployment and verified sender setup.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='pickle-moderation-email-worker';
