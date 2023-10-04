---
date: 2023-11-29 13:25:00 -0400
title: Figgy Migration Details
layout: default
---

## Setting up Logical Replication and Warm Standbys for PostgreSQL 15
**by Alicia Cozine, Anna Headley, Francis Kayiwa, and Trey Pendragon**

### How to Set Up Logical Replication

To set up stuff:

### Migration Steps

We created a detailed [runbook](https://github.com/pulibrary/figgy/issues/5903) for the actual migration. The process took one hour and 13 minutes - much better than our estimated two days. Some of this time was spent looking for connections in the old database and reassuring ourselves that the application was really using the new database.

### How to Set Up Warm Standbys

We updated our existing Ansible playbooks (link to playbooks?) and created some new ones to set up standby config for the final cluster. Here's how those playbooks work:
- To make a replica, you have to have a leader machine that is running and a standby machine that has never been turned on. You have to then sync the data directory exactly before bringing up the standby machine.
- There’s a replication.conf file that goes onto all machines, but there’s a difference in the last line for the standby machine.
- The leader tasks run first. They make a special replication user, which does not have database access but can read write-ahead logs. It also ensures all followers are in the pg_hba.conf file and have correct permissions to replicate.
- Then the follower tasks run. They ensure the whole cluster is in the follower's pg_hba.conf so we can promote it if/when we need to. The follower also needs a standby.signal file. If it doesn't exist, the tasks ensure that the postgres service is stopped, delete its data directory, rsync the data directory from the leader via the postgres port (this is what pg_basebackup does), then add a standby.signal file (this is specific to postgres 15 -- this is a mechanism that has changed a lot), and finally start the postgres service.
- The leader and follower tasks only run on pg machines that are configured with postgres_cluster values, so you can have other clusters configured differently.


### Lessons Learned

1. We can spin up a new database cluster if we have an application that shouldn't be on the central one.
1. Ansible can be set up to run SQL commands.
1. We weren't tuning our postgreSQL server to use more memory.

### Next Steps

We still don't really understand PostgreSQL for really big databases. We want to know if we could get better performance, we want to be able to replicate production data into staging, we want to do isolated backup restoration (one table, one row), and we want reliability.

