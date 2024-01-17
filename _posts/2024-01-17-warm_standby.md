
### How to Set Up Streaming Replication (aka Warm Standbys)

We updated our existing [Ansible playbooks]() to set up standbys using streaming replication for the final cluster. Here's how those playbooks work:

- To make a replica, you need two identical machines - same resources, same version of PostgreSQL - one of which is already active and the other of which has never been turned on. Configure your current active machine as a leader. Then sync the data directory exactly before bringing up the second machine, which you configure as a follower.
- There’s a replication.conf file that goes onto all machines, but there’s a difference in the last line for the standby machine.

TODO: include non-ansible steps for these

- The leader tasks run first. They make a special replication user, which does not have database access but can read write-ahead logs. It also ensures all followers are in the pg_hba.conf file and have correct permissions to replicate.
- Then the follower tasks run. They ensure the whole cluster is in the follower's pg_hba.conf so you can promote it if/when you need to. The follower also needs a standby.signal file. If it doesn't exist, the tasks ensure that the postgres service is stopped, delete its data directory, rsync the data directory from the leader via the postgres port (this is what pg_basebackup does), then add a standby.signal file (this is specific to postgres 15 -- this is a mechanism that has changed a lot), and finally start the postgres service.
- The leader and follower tasks only run on pg machines that are configured with postgres_cluster values, so you can have other clusters configured differently.

### What's Next?

Now that we have completed our big migration, we are looking for ways to make our migration runbook more efficient. We did put the application in read-only mode, which might not be necessary next time if we use [PGbouncer](https://www.pgbouncer.org/).

We are also looking to expand our understanding of PostgreSQL for really big databases. We want to know if we could get better performance, we want to be able to replicate production data into staging, we want to do isolated backup restoration (one table, one row), and we want reliability.
