---
date: 2019-04-23 09:28:25 -0600
title: Preservation Packaging
layout: default
---

## Preservation Packaging
**by Esmé Cowles**

As we are implementing [preservation](https://pulibrary.github.io/2019-04-16-preservation)
in [Figgy](https://github.com/pulibrary/figgy), we have faced a couple of challenging
decisions that lay just outside the concern of preservation-oriented specifications like
[BagIt](https://tools.ietf.org/html/rfc8493) and [OCFL](https://ocfl.io/). Two
inter-related questions that took us a lot of discussion and exploration to reach
consensus on are:
1. What is the best unit of preservation?
1. Should preservation packages be compressed and/or archived?
<!--more-->

### What is the best unit of preservation?

There are a wide range of practices here, from including an entire repository or
collection in a single package, to having a separate package for each repository object.
Our repository implementation has separate objects for each page in a book, for controlled
vocabulary terms, and other similar metadata constructs that don't make much sense in
isolation. At the other extreme, including our entire repository in a single package
seemed like it would create a package that was very difficult to navigate without a search
index, which made it a poor fit since one of our goals was to have preservation packages
that could be understood without custom tools. Collections also did not seem like a good
fit, since most of our objects can belong to multiple collections or no collections at
all.

So we decided that the best unit of preservation was a work and all of its children. We
expect restoration to happen at the work level, or in the context of a work, such as
"page 5 of work X", so packaging at the work level would make that much easier. And in
disaster scenarios where Figgy might not be available, it would be much easier to work
with a single work, and not have to navigate the entire repository to find the files or
metadata you wanted to access.

And while considering a work the unit of preservation makes intuitive sense, it led to a
number of questions:

1. What exactly is the boundary of a work? We typically use
[PCDM](https://github.com/duraspace/pcdm/wiki)-style membership relationships. And we
typically use `hasMember` to link from a work to its component parts (including FileSets),
and `memberOf` to link from a work to the Collection(s) it's a member of. But we have
some work types that model Collection membership with the Collection linking to the
member, but we wouldn't want to preserve those entire Collections as one preservation
package.
1. Should we include information about items that aren't part of the work, but may be
necessary to understand the work? For example, should we include Collection metadata, or
controlled vocabulary term metadata? Or is it enough to link to them and preserve them
separately?
1. Is it OK to update a work's preservation package piecemeal, even though it might not
represent a coherent state of the work?

Our initial implementation will rely on tagging each repository object that we consider a
work with a preservation policy that will trigger preserving it and its members
recursively. We'll preserve collection and controlled vocabulary objects separately
instead of duplicating them in each work that refers to them. And we'll propagate updates
to the preservation package as they happen rather than trying to figure out when a set of
updates is done.


### Should preservation packages be compressed and/or archived (e.g., in Tar or Zip)?

A separate but related question is whether we should bundle the files from our
preservation packages in Tar or Zip archives. We are exploring several different storage
options, including Amazon Glacier, and Glacier's asynchronous access model would make it
very cumbersome to separately retrieve many files to restore an object. Having the
preservation package encapsulated in a single file would also make retrieving it more
convenient in other circumstances, too. The other benefit we saw to having a single-file
preservation package is the ability to use the file's checksum to verify the package
integrity, instead of having to separately verify each file's checksum.

However, storing preservation packages in Tar or Zip format would have a number of
disadvantages that made us decide against it. The biggest disadvntage is that we would
need to create the preservation package locally, Tar/Zip it, and then re-upload the entire
package. This would consume much more bandwidth, use more local storage, and virtually
require that we revisit the decision to propagate individual changes (or risk multiple
overlapping updates corrupting the preservation package). Another disadvantage would be
creating single files that are very large. Although range requests and other strategies
can make them easier to work with, having single files that are very large would make it
harder to work with the preservation packages, require more disk space, etc.
