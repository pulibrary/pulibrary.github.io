---
date: 2023-11-29 13:25:00 -0400
title: Figgy Migration Details
layout: default
---

## Migrating to PostgreSQL 15 with Logical Replication 
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

You will want to modify the process below to suit your local environment. Make each step specific so you can copy and paste.


This is how we did it:

- Select a page to use for testing. Make sure it loads and save the URL.
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
- Run the following query (which we pulled from the [postgresl.org wiki](https://wiki.postgresql.org/wiki/Fixing_Sequences)) in the new database's psql terminal to update the sequences:

```sql
SELECT 
    'SELECT SETVAL(' ||
       quote_literal(quote_ident(sequence_namespace.nspname) || '.' || quote_ident(class_sequence.relname)) ||
       ', COALESCE(MAX(' ||quote_ident(pg_attribute.attname)|| '), 1) ) FROM ' ||
       quote_ident(table_namespace.nspname)|| '.'||quote_ident(class_table.relname)|| ';'
FROM pg_depend 
    INNER JOIN pg_class AS class_sequence
        ON class_sequence.oid = pg_depend.objid 
            AND class_sequence.relkind = 'S'
    INNER JOIN pg_class AS class_table
        ON class_table.oid = pg_depend.refobjid
    INNER JOIN pg_attribute 
        ON pg_attribute.attrelid = class_table.oid
            AND pg_depend.refobjsubid = pg_attribute.attnum
    INNER JOIN pg_namespace as table_namespace
        ON table_namespace.oid = class_table.relnamespace
    INNER JOIN pg_namespace AS sequence_namespace
        ON sequence_namespace.oid = class_sequence.relnamespace
ORDER BY sequence_namespace.nspname, class_sequence.relname;
```
- This will output a new query which you should copy and paste and run.

- Update the application configuration to point to the new database.
- Restart your web server and any workers.
- Make sure your test page loads.
- We have multiple servers in a load-balanced setup, so we updated the application server configuration in two batches. We removed half of our servers from the load balancer, updated them, reinstated them, removed the other half from the load balancer, restarted the web servers and workers, then checked that our test object still loaded before repeating those steps on our other servers. This gave us a way to retreat if we needed to. It also kept the system available for read operations during the upgrade.
- Take the application out of read-only mode, or start it up again. Do not advertise this yet.
- Try any other operations your application offers, make sure they work.
- Check your monitoring systems, make sure they don't show more errors than normal.
- If good, throw a party.
- If bad, put it back in read only mode, check the time, and either resolve or undo everything.
- Turn off logical replication by deleting the subscription on your new database (`DROP SUBSCRIPTION <project_name>_subscription;`)
- Set up and enable your preferred backup strategy for your new database, verify.
- Notify your users that the system is available again. We posted on Slack: `We've finished maintenance on Figgy, feel free to do whatever work you need to with the load balancer.`

The migration itself took one hour and 13 minutes - much better than our original estimate of two days. Some of this time was spent looking for connections in the old database and reassuring ourselves that the application was really using the new database. All our earlier work paid off hugely.

We got longer-term benefits from the work we put in as well. Now we can spin up a new database cluster with confidence when we need one. We can use Ansible to run SQL commands. And we can tune the PostgreSQL cluster for our Figgy application, optimizing memory usage for our largest database.

In our next post we will discuss how to set up a warm standby with streaming replication.
