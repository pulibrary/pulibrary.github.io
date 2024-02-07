---
date: 2024-02-07 13:25:00 -0400
title: PostgreSQL Streaming Replication
layout: default
---

## How to Set Up Streaming Replication (aka Warm Standbys)
**by Alicia Cozine, Anna Headley, Francis Kayiwa, and Trey Pendragon**

In our [previous post](2024-01-31-figgy-migration-details) we described how to set up logical replication and use it as a migration strategy between different versions of PostgreSQL. Here we'll describe how to set up streaming replication, for use as an always-up-to-date failover copy.

### Requirements

Two identical PostgreSQL 15 machines, named here as `leader` and `follower`

### Steps

1. Ensure PostgreSQL 15 is installed on both machines.
<!--more-->
2. Start with the leader:
   1. Create a replication database user with the `REPLICATION` role attribute:
      ```sql
      CREATE ROLE replication WITH REPLICATION LOGIN PASSWORD 'passwordhere';
      ```
   2. Add the follower IP to `/etc/postgresql/15/main/pg_hba.conf` on the leader, so it can accept connections from the follower:
      ```/etc/postgresql/15/main/pg_hba.conf
      host    replication             replication             <follower_ip/32>       md5
      ```
      If you have more than one follower, you'll need them all here too.
   3. Restart PostgreSQL on the leader.
3. On the follower:
   1. Add the leader IP to `/etc/postgresql/15/main/pg_hba.conf` on the follower, so it can accept connections from the leader:
      ```/etc/postgresql/15/main/pg_hba.conf
      host    replication             replication             <leader_ip/32>       md5
      ```
      If you have other followers, you'll want them all here too. We only have one.
   1. Turn off PostgreSQL on the follower - we have to wipe it and copy all the data from the leader so it's an exact copy, without it being turned on.
      `sudo service postgresql stop`
   1. Wipe the follower PostgreSQL data directory and reinstate it from the leader. This will copy all the data, and might take a while.
      ```
      rm -rf /var/lib/postgresql/15/main && /usr/bin/pg_basebackup -Xs -d "hostaddr=<leader_ip> port=5432 user=replication password=<passwordhere>" -D /var/lib/postgresql/15/main -v -Fp
      ```
   1. Create a `standby.signal` file in the PostgreSQL 15 data directory to notify PostgreSQL to turn on in standby mode:
      `touch /var/lib/postgresql/15/main/standby.signal`
      Note: Other versions may have different ways of signalling standby mode. This is how it works in 15. You can check the [documentation](https://www.postgresql.org/docs/15/warm-standby.html#STANDBY-SERVER-OPERATION) for your version.
   1. Start PostgreSQL on the follower.
      `sudo service postgresql start`
4. Test! You should be able to make a new record in the `leader`, and query for it in the `follower` and it should return.

### What's Next?

Now that we have completed our big migration, we are looking for ways to make our migration runbook more efficient. We did put the application in read-only mode, which might not be necessary next time if we use [PGbouncer](https://www.pgbouncer.org/).

We are also looking to expand our understanding of PostgreSQL for really big databases. We want to know if we could get better performance, we want to be able to replicate production data into staging, we want to do isolated backup restoration (one table, one row), and we want reliability.
