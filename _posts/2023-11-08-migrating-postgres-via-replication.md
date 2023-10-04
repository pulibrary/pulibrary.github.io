---
date: 2023-11-08 13:25:00 -0400
title: Migrating PostgreSQL via Replication
layout: default
---

## Migrating PostgreSQL via Replication
**by Alicia Cozine, Anna Headley, Francis Kayiwa, and Trey Pendragon**

### The Database in Question

Our digital repository application, fondly known as Figgy, has a database that's 200GB. 99% of the data is in one giant table in a metadata (JSON-B) column. The database is indexed in Solr, and reindexing takes at least 16 hours. Before our adventure began, the database lived in a Postgres 10 instance on an old physical server. The hardware and software were all end-of-life (EOL). We needed to migrate it. But how?

### The Process

We wanted to approach the migration in a cross-team, low-stress way. We chartered a PostgreSQL book club with two rules: meet for one hour each week, and no work outside the meeting ("no homework"). We wanted to answer a lot of questions about postgresql, but we needed to migrate the Figgy database first.

### Options & Decision

First we started to build a copy of our production infrastructure on Postgres 10, so that we could carefully try out different migration strategies to move fully from 10 to 15. This turned out to be difficult. All the versions were so old - we would have needed EOL Ubuntu servers to build the EOL Postgres versions, which seemed like wasted effort.

The next thing we did was try a dump and restore to see how long it took. This is how we had successfully migrated all our other databases off that old physical server. For Figgy, though, the fastest possible dump took 45 minutes and restoring it took 15 hours. Reindexing would have taken another 18 hours or more. If we had started the process on a Tuesday, we could have started the reindex on Wednesday and Figgy could have been back up on Thursday. But that would still be 2 days with the site in read-only mode. We abandoned this approach before we even reindexed. 

We didn't want the migration to involve that much downtime and disruption. We also have and support a culture of not working after hours or on the weekend.

Meanwhile, setting up that dump-and-restore process also broke our regular backups, though we didn't know that yet (dun, dun, dunnnnnnnn!).

### The Peril

While we were discussing what to do next, our old infrastructure went down and took the site down with it. We knew how long dump-and-restore would take, and now we were faced with a unplanned outage - two days of downtime with no access to digital content.

This is when we realized that our attempt to dump and restore had broken backups! The most recent backup we could find was six weeks old. Restoring from that backup did not go well. While we were working on that, the old physical server came back up. We fixed the backups but we were feeling even less comfortable than before.

#### The Peril 2: Peril Harder

And it turned out we were right, because the server blew up again only a few days later. This time it was even worse. Fire trucks were involved (though there was no actual fire, and no servers or humans were harmed):

![The lobby of a datacenter with a fire extinguisher and a fire axe](/assets/images/DataCenterAxe.jpg)
![The exterior of a datacenter with fire trucks](/assets/images/DataCenterFireTrucks.jpg)

We had fixed backups, so we were less panicked, but it was still bad. While we were unzipping our latest backup, the server came back up again.

At this point we knew we had to act, fast. We had done some research on logical replication, so in a panic we set it up. This turned out to be a great idea - over time, the huge database replicated itself on new infrastructure. Logical replication not only migrated the data in our database, it migrated it into Postgres 15 and continued to keep the data in sync.

This approach also meant that Solr was always up-to-date. This saved 16 hours of reindex time when we were ready to migrate.

### The Outcome

Once we realized how awesome logical replication was, and how much time it would save us, we decided to use it for the migration. Logical replication makes a second postgresql instance mirror a first one by replicating each SQL command that runs on the first instance, and by copying any pre-existing content from the first instance to the second by running additional SQL commands. Logical replication cannot duplicate all elements of a database. For example, the sequences in the source database need to be recreated in the destination database. However, you can use logical replication across different versions of postgresql because the changes are implemented using SQL commands, which do not change from version to version.

However, we are using a different tool - warm standby configuration - for ongoing resilience. Warm standbys literally copy the files from the disk of one postgresql instance to the disk of another. The two instances must be running the same version of postgresql, because new postgresql releases can change the format or name of those files. Warm standbys provide perfect replication with no side effects. 

For the post-migration infrastructure, we built all-new virtual machines (VMs) so our staging and production environments each had a leader and a follower. We put the Figgy database on its own cluster, so we could tune it separately from our other, smaller databases. We set one VM up as a warm standby for each environment, so we can recover from any future downtime without reindexing Solr. Warm standbys give us resilience now. Logical replication gives us an upgrade path for the future.

### Conclusion

We migrated a 200GB database in under 2 hours, ask us how!

Almost everyone on the internet recommends the dump-and-restore method of migrating or recreating postgresql databases. But it's not always the best method. For a really large database, logical replication works with less downtime by doing most of the work while your old database is still in use.

In our next post we will describe the detailed steps we took to set up logical replication, migrate our database, and set up warm standbys for the new database servers.
