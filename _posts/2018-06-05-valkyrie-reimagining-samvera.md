---
date: 2018-06-05 17:22:25 -0600
title: Valkyrie, Reimagining the Samvera Community
layout: default
---

## Valkyrie, Reimagining the Samvera Community
**by Esmé Cowles**

I generally don't find looking at slides to be a good substitute for watching a talk, and I'd
rather read a text version than watch a video, so I thought I'd write up a brief summary of my talk
at [Open Repositories](https://or2018.net/).

<!--more-->

### First of all, what is Valkyrie?

[Valkyrie](https://github.com/samvera-labs/valkyrie) is a new persistence layer for
[Samvera](https://samvera.org/).  It's the core part of the repository stack that handles storing
metadata and files.  It provides APIs for acessing and navigating relationships between objects.
If you're familiar with the Samvera stack, it's a replacement for
[ActiveFedora](https://github.com/samvera/active-fedora/).

One of the key features of Valkyrie is swappable backends — allowing you to use different storage
options in your application without having to change any of the code.  So while ActiveFedora
supports [Fedora](https://wiki.duraspace.org/display/FF/Fedora+Repository+Home) and
[Solr](http://lucene.apache.org/solr/), Valkyrie supports both of those and several other options,
including [Postgresql](https://www.postgresql.org/), [Redis](https://redis.io/), Rails ActiveRecord
databases, Amazon [DynamoDB](https://github.com/samvera-labs/valkyrie-dynamodb) and
[CloudSearch](https://github.com/samvera-labs/valkyrie-cloud_search).  It does this by providing a
set of APIs for persistence — a set of abstractions for working with files and metadata.  This
includes a (small) set of queries for loading and navigating between objects.  N.b., this isn't
fulltext or keyword search like an end user might use, but basic navigation like finding the page
objects that are members of a book object.

Valkyrie also provides a
[shared test suite](https://github.com/samvera-labs/valkyrie/wiki/Shared-Specs) for verifying that
backends behave they way they are expected to.  This is used internally to verify that the core
backends all behave consistently.  And it helps make the development of new backends easier, since
you can run the same test suite against your backend to make sure it behaves the way Valkyrie
expects.  Since Ruby/Rails doesn't have the same kind of interface definitions that some other
languages have, this test suite effectively serves as the interface declaration.

### Why did we develop Valkyrie?

We began thinking about ways we might insert new API abstraction layers into the Samvera stack when
we were working on [Curation Concerns](https://github.com/samvera/curation_concerns) (now
[Hyrax](https://github.com/samvera/hyrax)), and started seeing divergent use cases.  At first, we
thought that there was an important distinction between institutional repositories and digital
collections, but we came to see that as a false dichotomy.  We came to see other differences as more
important, such as whether you wanted to have a control panel in your application to customize it,
or whether you would rather write code to change the way your application worked.  And we also saw
metadata complexity, and in particular, the scale and scope of linking between objects, as a key
point of divergence.  Whether the linking was because of [PCDM](https://pcdm.org/), or modeling
controlled vocabularies as repository objects, or something else, as the scale of linking grew, we
started to see serious performance problems.

The performance problems first manifested themselves as ingest problems.  As we loaded larger and
larger objects, we noticed that each page took more time to ingest than the last.  Once we had large
objects ingested, we saw that the time to read and save them grew longer the more members the object
had.  These are both manifestations of the
"[many members](https://wiki.duraspace.org/display/FF/Many+Members+Performance+Testing)" problem,
where the time to retrieve an object from Fedora grows linearly with the number of links it has to
other repository objects.  We worked to address this problem as all levels of the Samvera stack,
including in Fedora, in the Ruby RDF processing code, and in Curation Concerns/Hyrax.  But as we did
so, we noticed a more fundamental problem: complexity.

In theory, Fedora and Solr serve very distinct roles in the Samvera framework.  It makes for nice
architecture diagrams, but in practice, their use is very intertwined.  Because Solr provides query
functionality that Fedora doesn't, and because Solr is often faster than Fedora, there are many
places in the code where Solr is used instead of Fedora.  And because there are no clearly-defined
APIs or abstractions, these calls to solr typically invovle low-level Solr concerns, such as field
names and query syntax.  Both the core ActiveFedora code and application code do this in many
places, resulting in complexity that makes it hard to address performance problems, and in fact,
deters developers from working on ActiveFedora.

So, we developed Valkyrie to address the performance and complexity problems, and to provide a clear
abstraction for core repository functionality.  Now that Valkyrie is in production, it's a good time
to take stock of the ramifications of its development for the broader Samvera community.  The
Samvera community is large and I wouldn't presume to speak for all of them, but here are some
lessons I think we can learn:

### The Samvera working group process worked

Valkyrie was developed using a number of existing communication channels and processes:

* Trey Pendragon developed a prototype, and promoted it as a "breakable toy" at community events
* a working group was formed following the established process, with members from five institutions,
  working to define requirements
* community sprints were organized to implement a MVP application, with code contributions from 11
  institutions
* the working group released its final report and demonstrated the MVP at Samvera Connect 2017
* Valkyrie 1.0 was released in March 2018

So as the Samvera community considers many changes in governance, such as having rotating, elected
leadership, a community roadmap, and more formalized contributions, I think it's important to
recognize that many existing communication channels and community processes worked well for
Valkyrie.

### Fedora is not the center of the universe

I say this as a [Fedora Committer](https://wiki.duraspace.org/display/FF/Fedora+Committers) and
[Fedora API Specification](https://fedora.info/spec/) editor: Fedora works well for some use cases,
but isn't the best choice for everyone.  The API spec and alternative implementations promise to
provide more persistence options within Fedora.  But when we started working on Valkyrie, none of
the alternative implementations had the institutional support or sustainable development process
that we would need to adopt them.  A year later, there has been progress on finalizing the API
specification, but there is still not an alternative implementation we could adopt.

But regardless of whether it's within Fedora or using Valkyrie, having multiple backends to choose
from opens up many possibilities.  It gives you the option of choosing your backend based on your
performance or features needs.  Maybe your organization has strong guidance on what platforms to use
or not use, or maybe your staff has a lot of expertise with a certain storage option and so it makes
sense to use it.

### How do we conceptualize Samvera?

Using Fedora has been *the* defining aspect of the Samvera community, with Samvera defined in
relation to Fedora.  It's true that some institutions have used parts of the Samvera stack with
other backends (notably UCSD and DPLA) — but their model was not widely adopted or promoted as a
replacement for ActiveFedora.  As using different backends becomes a core part of the Samvera stack,
it means we should rethink Samvera, and how it relates to other technologies.  And like the renaming
from Hydra to Samvera last year, it gives us an opportunity to think about who we are and who we
want to be.

### Code and data stewardship

There is a lot of code that will need to be updated to use Valkyrie, and since there are calls to
Solr scattered around core gems and applications, that will require careful review to find them all.
We also have many deployed Samvera applications with lots of data.  So we will need to be careful to
provide good migration tooling, and minimize the amount of data that needs to be updated.

We haven't always done a good job of this in the past, and many Samvera adopters are running old
versions of the software in part because code and data migrations are hard.  So this is an
opportunity for us to live up to our stated values of avoiding unnecessary data migrations, making
code migrations as easy as possible, and generally supporting sustainable repositories.

### Lesson from Islandora: don't fight against your platform

A part of the [Islandora CLAW](https://islandora.ca/CLAW) effort is to fully embrace the Drupal
platform so that Islandora applications can take full advantage of existing Drupal modules.  past
versions weren't compatible with most Drupal modules, because they didn't use the Drupal Node
system they depended on.

In much the same way, ActiveFedora was modeled after ActiveRecord, but it wasn't compatible with
many community gems because it wasn't actually ActiveRecord.  By contrast, Valkyrie uses more
community gems, such as [Dry::Types](http://dry-rb.org/gems/dry-types/),
[Dry::Struct](http://dry-rb.org/gems/dry-struct/), [reform](http://trailblazer.to/gems/reform/)
and [draper](https://github.com/drapergem/draper), allowing Valkyrie applications to work with a
wider variety of gems.

One practical impact of this related to hiring (and retaining) developers.  There are many more
Rails developers than Samvera developers.  And following the patterns those developers know makes it
easier to hire Rails developers and have them be productive and happy, (instead of being frustrated
by ActiveFedora and Fedora more broadly). 

### Everything doesn't need to be a product

Many institutions are adopting Hyrax, and there is a lot of momentum around it.  But I think that
it's important for there to be a place in the Samvera community for building your own application
from components, instead of using an existing solution bundle.  I don't think a one-size-fits-all
approach will work well for the Samvera community.  And building reusable components will help us
take the best advantage of the broader rails ecosystem, and build components that are usable beyond
our small community.
