---
date: 2023-11-29 13:25:00 -0400
title: Figgy Migration Details
layout: default
---

## Setting up Logical Replication and Warm Standbys for PostgreSQL 15
**by Alicia Cozine, Anna Headley, Francis Kayiwa, and Trey Pendragon**

In our [previous post](2023-11-08-migrating-postgres-via-replication.md), we described how we decided to migrate a very large database using logical replication. In this post we will detail the steps we followed to make it happen.

### How to Set Up Logical Replication

Before the migration really began, we set up logical replication. This recreated our very large database in an upgraded version of PostgreSQL.

To set up logical replication, we started with the [AWS Database Migration Guide](https://docs.aws.amazon.com/dms/latest/sbs/chap-manageddatabases.postgresql-rds-postgresql-full-load-publisher.html), then expanded and adapted the steps to our local environment.

Here's how we did it:

First set up the publisher.
- Ensure the source system (the publisher) can accept requests from the target system (the subscriber): edit the pg_hba.conf file on the source system (for us it was our old PostgreSQL 10 machine):
``` /etc/postgresql/<version>/main/pg_hba.conf
host    all             all             <IP_of_subscriber/32>       md5
```
- Make the publisher keep detailed "write ahead logs" (WALs) to support logical replication:
``` /etc/postgresql/<version>/main/postgresql.conf
wal_level = 'logical'
max_replication_slots = 10
max_wal_senders = 10
```
- Restart postgresql on the publisher to load the config changes you've made:
``` command line
sudo systemctl restart postgresql
```
- Log into your old PostgreSQL database and create a publication for all tables on the publisher:
``` psql CLI
CREATE PUBLICATION <project_name>_publication FOR ALL TABLES;
```

Next, set up the subscriber (for us it was our new PostgreSQL 15 machine).
- Get the schema from the publisher and save a copy on the subscriber:
``` command line
pg_dump --schema-only -d <database_name> -h <publisher_IP> -U <postgres_admin_user> -f /tmp/<database_name>-schema.sql --no-owner'
```
- Create the database user(s) you need.
``` psql CLI
CREATE USER <database_user_name> WITH PASSWORD '<password>';
```
- Create an empty database.
``` psql CLI
CREATE DATABASE <database_name> OWNER <database_user_name>;
```
- Load the sql schema into your new, empty database on the subscriber:
``` command line
psql -d <database_name> -U <postgres_admin_user> -f /tmp/<database_name>-schema.sql
```
- Create a subscription on the new PostgreSQL 15 database so it will listen for updates from the PostgreSQL 10 database:
``` psql CLI
CREATE SUBSCRIPTION <project_name>_subscription
CONNECTION 'host=<publisher_IP> port=5432 dbname=<database_name> user=<postgres_admin_user> password=<postgres_admin_password>' PUBLICATION <project_name>_publication WITH copy_data=true;
```
Once everything is set up, wait for full replication to happen. You can validate that replication is complete by generating row counts in both databases and comparing those numbers:
``` psql CLI
WITH tbl AS
  (SELECT table_schema,
          TABLE_NAME
   FROM information_schema.tables
   WHERE TABLE_NAME not like 'pg_%'
     AND table_schema in ('public'))
SELECT table_schema,
       TABLE_NAME,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, TABLE_NAME), FALSE, TRUE, '')))[1]::text::int AS rows_n
FROM tbl
ORDER BY rows_n DESC;
```

Once replication was complete, we wanted to be sure our upgraded database had resilience built in, so we set up a warm standby in addition to our usual backup process.

### How to Migrate the Application

We created a detailed [runbook](https://github.com/pulibrary/figgy/issues/5903) for the application migration. We didn't just create the runbook, we went over it multiple times. Each time, we thought of additional steps or came up with verification checks we could run. We probably spent five times as much time on reviewing the runbook as we did on actually migrating the application.

Here's how we did it:

- Select an object to use for testing. Make sure it loads and save the URL.
- Open a terminal to each database server:
    * `ssh user@old-database`
    * `ssh user@new-database`
- Open a SQL terminal connected to `<database_name>` on both servers: `sudo -u postgres psql -d <database_name>`
- Check row counts for all tables between both servers:
```sql
WITH tbl AS
  (SELECT table_schema,
          TABLE_NAME
   FROM information_schema.tables
   WHERE TABLE_NAME not like 'pg_%'
     AND table_schema in ('public'))
SELECT table_schema,
       TABLE_NAME,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, TABLE_NAME), FALSE, TRUE, '')))[1]::text::int AS rows_n
FROM tbl
ORDER BY rows_n DESC;
```
- Assuming they're close, move on. If they're far off, stop here. Something's broken.
- Notify your users. We did this using Slack: `@here We're now starting scheduled maintenance of Figgy, it will be going into read only mode for up to 3 hours. We'll send another message here when it's ready for regular use again.`
- Set your application to read-only mode (or shut it down), so nobody can add new records while you migrate.
- Check row counts for all tables between both servers again (belt and suspenders, folks).
- If they're not exact, wait a minute, try again. If they never become exact, then stop. Otherwise, continue.
- [Update the sequences](https://wiki.postgresql.org/wiki/Fixing_Sequences) in the new database.
- Run the following query in the new database's psql terminal.
TODO: how did we generate this list of tables???
```sql
 SELECT SETVAL('public.active_storage_attachments_id_seq', COALESCE(MAX(id), 1) ) FROM public.active_storage_attachments;
 SELECT SETVAL('public.active_storage_blobs_id_seq', COALESCE(MAX(id), 1) ) FROM public.active_storage_blobs;
 SELECT SETVAL('public.active_storage_variant_records_id_seq', COALESCE(MAX(id), 1) ) FROM public.active_storage_variant_records;
 SELECT SETVAL('public.auth_tokens_id_seq', COALESCE(MAX(id), 1) ) FROM public.auth_tokens;
 SELECT SETVAL('public.authorization_models_id_seq', COALESCE(MAX(id), 1) ) FROM public.authorization_models;
 SELECT SETVAL('public.bookmarks_id_seq', COALESCE(MAX(id), 1) ) FROM public.bookmarks;
 SELECT SETVAL('public.browse_everything_authorization_models_id_seq', COALESCE(MAX(id), 1) ) FROM public.browse_everything_authorization_models;
 SELECT SETVAL('public.browse_everything_session_models_id_seq', COALESCE(MAX(id), 1) ) FROM public.browse_everything_session_models;
 SELECT SETVAL('public.browse_everything_upload_files_id_seq', COALESCE(MAX(id), 1) ) FROM public.browse_everything_upload_files;
 SELECT SETVAL('public.browse_everything_upload_models_id_seq', COALESCE(MAX(id), 1) ) FROM public.browse_everything_upload_models;
 SELECT SETVAL('public.delayed_jobs_id_seq', COALESCE(MAX(id), 1) ) FROM public.delayed_jobs;
 SELECT SETVAL('public.ocr_requests_id_seq', COALESCE(MAX(id), 1) ) FROM public.ocr_requests;
 SELECT SETVAL('public.roles_id_seq', COALESCE(MAX(id), 1) ) FROM public.roles;
 SELECT SETVAL('public.searches_id_seq', COALESCE(MAX(id), 1) ) FROM public.searches;
 SELECT SETVAL('public.session_models_id_seq', COALESCE(MAX(id), 1) ) FROM public.session_models;
 SELECT SETVAL('public.upload_files_id_seq', COALESCE(MAX(id), 1) ) FROM public.upload_files;
 SELECT SETVAL('public.upload_models_id_seq', COALESCE(MAX(id), 1) ) FROM public.upload_models;
 SELECT SETVAL('public.users_id_seq', COALESCE(MAX(id), 1) ) FROM public.users;
```
- Update the application configuration to point to the new database.
- Restart your web server and any workers.
- Make sure your test object loads.
- We have multiple servers in a load-balanced setup, so we did those three steps multiple times. We removed half of our servers from the load balancer, updated them, reinstated them, removed the other half from the load balancer, restarted the web servers and workers, then checked that our test object still loaded before repeating those steps on our other servers. This gave us a way to retreat if we needed to. It also kept the system available for read operations during the upgrade.
- Take the application out of read-only mode, or start it up again. Do not advertise this yet.
- Create a new object, make sure that works.
- Try any other operations your application offers, make sure they work.
- Check your monitoring systems, make sure they don't show more errors than normal.
- If good, throw a party.
- If bad, put it back in read only mode, check the time, and either resolve or undo everything.
- Turn off logical replication by deleting the subscription on your new database (`DROP SUBSCRIPTION <project_name>_subscription;`)
- Set up and enable backup, verify.
- Notify your users that the system is available again. We posted on Slack: `We've finished maintenance on Figgy, feel free to do whatever work you need to with the load balancer.`

The migration itself took one hour and 13 minutes - much better than our original estimate of two days. Some of this time was spent looking for connections in the old database and reassuring ourselves that the application was really using the new database. All our earlier work paid off hugely.

We got longer-term benefits from the work we put in as well. Now we can spin up a new database cluster with confidence when we need one. We can use Ansible to run SQL commands. And we can tune the PostgreSQL cluster for our Figgy application, optimizing memory usage for our largest database.

### How to Set Up Streaming Replication (aka Warm Standbys)

We updated our existing [Ansible playbooks]() to set up standbys using streaming replication for the final cluster. Here's how those playbooks work:

- To make a replica, you need two identical machines - same resources, same version of PostgreSQL - one of which is already active and the other of which has never been turned on. Configure your current active machine as a leader. Then sync the data directory exactly before bringing up the second machine, which you configure as a follower.
- There’s a replication.conf file that goes onto all machines, but there’s a difference in the last line for the standby machine.
- The leader tasks run first. They make a special replication user, which does not have database access but can read write-ahead logs. It also ensures all followers are in the pg_hba.conf file and have correct permissions to replicate.
- Then the follower tasks run. They ensure the whole cluster is in the follower's pg_hba.conf so you can promote it if/when you need to. The follower also needs a standby.signal file. If it doesn't exist, the tasks ensure that the postgres service is stopped, delete its data directory, rsync the data directory from the leader via the postgres port (this is what pg_basebackup does), then add a standby.signal file (this is specific to postgres 15 -- this is a mechanism that has changed a lot), and finally start the postgres service.
- The leader and follower tasks only run on pg machines that are configured with postgres_cluster values, so you can have other clusters configured differently.

### What's Next?

Now that we have completed our big migration, we are looking for ways to make our migration runbook more efficient. We did put the application in read-only mode, which might not be necessary next time if we use [PGbouncer](https://www.pgbouncer.org/).

We are also looking to expand our understanding of PostgreSQL for really big databases. We want to know if we could get better performance, we want to be able to replicate production data into staging, we want to do isolated backup restoration (one table, one row), and we want reliability.
