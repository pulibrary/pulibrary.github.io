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

To set up logical replication, we followed the [AWS Database Migration Guide](https://docs.aws.amazon.com/dms/latest/sbs/chap-manageddatabases.postgresql-rds-postgresql-full-load-publisher.html). The basic steps are:
- edit the config for the PostgreSQL 10 machine so it allows other databases to subscribe to its updates
- create an empty database on the new PostgreSQL 15 machine and initialize it with the correct database schema
- create a subscription on the new PostgreSQL 15 database so it will listen for updates from the PostgreSQL 10 database
- wait for full replication to happen - you can validate that replication is complete by generating row counts in both databases and comparing those numbers

Once replication was complete, we wanted to be sure our upgraded database had resilience built in, so we set up a warm standby in addition to our usual backup process.

### How to Set Up Streaming Replication (aka Warm Standbys)

We updated our existing Ansible playbooks to set up standbys using streaming replication for the final cluster. Here's how those playbooks work:

- To make a replica, you need two identical machines - same resources, same version of PostgreSQL - one of which is already active and the other of which has never been turned on. Configure your current active machine as a leader. Then sync the data directory exactly before bringing up the second machine, which you configure as a follower.
- There’s a replication.conf file that goes onto all machines, but there’s a difference in the last line for the standby machine.
- The leader tasks run first. They make a special replication user, which does not have database access but can read write-ahead logs. It also ensures all followers are in the pg_hba.conf file and have correct permissions to replicate.
- Then the follower tasks run. They ensure the whole cluster is in the follower's pg_hba.conf so you can promote it if/when you need to. The follower also needs a standby.signal file. If it doesn't exist, the tasks ensure that the postgres service is stopped, delete its data directory, rsync the data directory from the leader via the postgres port (this is what pg_basebackup does), then add a standby.signal file (this is specific to postgres 15 -- this is a mechanism that has changed a lot), and finally start the postgres service.
- The leader and follower tasks only run on pg machines that are configured with postgres_cluster values, so you can have other clusters configured differently.

### Migration Steps

We created a detailed [runbook](https://github.com/pulibrary/figgy/issues/5903) for the actual migration.

The process took one hour and 13 minutes - much better than our estimated two days. Some of this time was spent looking for connections in the old database and reassuring ourselves that the application was really using the new database.

### Lessons Learned

1. We can spin up a new database cluster if we have an application that shouldn't be on the central one.
1. Ansible can be set up to run SQL commands.
1. We weren't tuning our postgreSQL server to use more memory.

### Next Steps

We still don't really understand PostgreSQL for really big databases. We want to know if we could get better performance, we want to be able to replicate production data into staging, we want to do isolated backup restoration (one table, one row), and we want reliability.

