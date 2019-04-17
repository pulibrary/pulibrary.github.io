---
date: 2019-04-16 8:56:00 -0400
title: Preservation
layout: default
---

## Preservation
**by Trey Pendragon**

Lately we've been working on preservation within
[Figgy](https://github.com/pulibrary/figgy) and have come up with a strategy we
think works for us. However, in doing so, we've evaluated a few options and come
up with some assumptions which could be useful to others.
<!--more-->

This isn't our entire preservation story (there are other issues such as
replication, management, audit trails, etc), but it compares a few options for
our back-end storage.


### Object Boundaries

I talk about an "object" a lot below. After much discussion, we decided at
  Princeton that we want a "directory" to consist of a top-level object (like a
  Book) and all its children.

This means a requirement is that I'm able to copy a single directory and get
everything I need to re-ingest that object and display it. External references
may not come in, but the hierarchy will.

So a Volume will be nested underneath its Multi-Volume Work, and a Page will be
nested underneath its Book. This is important, because if one decides against
this then the pros/cons of the following cases may change significantly.

### Assumptions

We want to store our files in a system which can do the following:

1. Store objects and its children in a hierarchy that we can easily navigate.
1. Store binaries as well as serialized metadata for each "object" that's
   stored.
1. Keep track of checksums for binary and metadata serializations.
1. Be able to verify files are in-tact using stored checksums.
1. Allow for re-ingest of an object from the Preservation back-end in the case
   of data loss.
1. Keep track of historical versions of both metadata and changing binary
   content.
1. Be able to performantly handle hierarchies for situations where an object may
   have thousands of members (pages in a book) that need to be preserved all at once.

### Options

This list is not exhaustive, but it's the options we evaluated.

1. [BagIt](https://tools.ietf.org/html/rfc8493)
   1. Specification which defines a way to package up binary content as well as
      metadata, along with checksums for each of them. Allows for "validation" of
      a bag, to ensure that it's well-formed (mostly that checksums match and
      required metadata exists.)
   2. We considered packaging these in a ZIP archive as well as not. Since we
      chose Google Cloud Storage over Amazon Glacier, we decided against a ZIP
      archive.
1. [OCFL](https://ocfl.io/0.2/spec/)
   1. A new specification for storing binary and metadata. Often explained to me
      as "bags with versions."
1. [Google Cloud Storage](https://cloud.google.com/storage/)
   1. Less of a specification than a platform. The proposal here is to simply
      store objects in a hierarchy and rely on GCS' versioning, checksum, and
      file metadata features rather than building an external "manifest" as in
      OCFL and BagIt.
   1. Files can be stored in a hierarchy similar to the following:

      ```
      - <resource-id>
        - data
          - <child-id>
            - <child-id>.json
            - <binary.tif>
        - <resource-id>.json
      ```
   1. This can also be read as "cloud option which supports versioning," this
      includes AWS. We chose GCS because we wanted to use archival storage
      (Coldline) with constant access times, whereas for access we would have had
      to wait a few hours for Amazon Glacier.
   1. Files in GCS hold their own checksums as a property of the file, and the
      uploaded metadata also contains our own calculated checksums.

### Test Cases

The following test cases are largely academic. We haven't done each of these,
but they've helped to think through what it would take to implement each in the
above options.

1. Preserve a Book with N pages.
1. Delete a full book
1. Delete a page from a book which is already preserved.
1. Add a page to a book which is already preserved.
1. Preserve a Book with Books which have Pages (A multi-volume work)

### Preserve a Book with N Pages

#### BagIt

1. Create a base directory named `<book-id>`
1. Create a `bagit.txt` in the base directory.
1. Optionally create a `bag-info.txt`
1. Iterate through each page and create a file in `<book-id>/data` named
   `<file-id>-<file-name>.<file-extension>` with the binary data. Store the
   metadata in `<book-id>/metadata/<file-id>.json`.
1. Either when done, or as each file is added, update `manifest-md5.json` and
   `tagmanifest-md5.json` with the checksums for each file in `data` and
   `metadata`.
1. Optionally update `bag-info.txt` to include the `Payload-Oxum` and `Bag-Size`

**Pros**:

1. We have a bag that people can look at and reasonably understand.
1. External systems may possible be able to ingest the material, but in practice
   this is pretty unlikely - bag profiles vary substantially from vendor to
   vendor.

**Cons**:

1. The manifest files act as a pessimistic lock on the system.
   * If we have to wait until everything is "done" uploading to update those
      manifests, then we need to have some way to tell when we're "done." To do
      this, in Ruby at least, either the uploads must be done sequentially on a
      single system or some sort of external locking mechanism must be used to
      keep track of current upload state.
   * If instead of waiting we simply update the manifest when a file is
      uploaded, then it means we need to have the ability to lock the file itself
      in place to avoid writes from multiple processes running into each other.
1. We have to prevent future changes to a child from persisting to preservation
   storage until this large change is done. Otherwise, the manifest will be
   corrupted by a race condition:
   1. Preservation starts. Pages start to persist into a bag.
   2. Page gets modified out of band (label changed or page switched)
   3. Page's changes get sent to be preserved.
   4. Page gets preserved in its spot in the bag, updating manifest.
   5. Initial preservation ends. Updates manifest, but has out-of-date checksum
      information.

#### OCFL

Implementation notes for OCFL provides options for things such as pair-trees for storing
objects in the object root. I'm going to treat that as an implementation detail
and pretend we're using a file system that can handle an infinite number of
resources in the same directory.

1. Create a base directory named `<book-id>`
1. Create a file named `0=ocfl_object_1.0` with the appropriate contents.
1. Create a v1 directory
1. Copy all content files and metadata files into `<book-id>/v1/content`, separated
   by ID. So, for instance, `<page1>` would be in `<book-id>/v1/content/<page1>`,
   and have two files: `<page1>.json` and
   `<page1>-<file-name>.<file-extension>`.
1. Create an `inventory.json` in `v1`, as per the specification, with SHA512s of
   every file in `content` as the keys of the `manifest` property.
1. Create `inventory.json.sha512` in the `v1` directory.
1. Copy `inventory.json` and `inventory.json.sha512` to the `<book-id>`
   directory.

**Pros**:

1. We now have an OCFL repository which is theoretically readable by future OCFL
   browsers, and will be understood by partner institutions.
1. This structure just needs a file system to store itself and support
   versioning, there's no need for an object store's feature-set.
1. We can de-duplicate as part of generating the `inventory.json` if we'd like
   to, using up less space than the other options.

**Cons**:

1. The inventory file acts as a pessimistic lock in the same way as BagIt's
   manifest file.
1. We have to prevent future changes to a child from persisting to preservation
   storage until this large change is done. Otherwise, the inventory will be
   corrupted by a race condition, and versions will be unable to be properly
   calculated:
   1. Preservation starts. Pages start to persist into a directory.
   2. Page gets modified out of band (label changed or page switched)
   3. Page's changes get sent to be preserved.
   4. Page gets preserved as a new version of the bag, updating the
      `inventory.json` and incrementing the version counter.
   5. Initial preservation ends. Updates inventory, but has out-of-date checksum
      information.
   6. However, since versions are numbered we could theoretically check to see
      before we start writing things if files exist to reduce the time we need
      to lock.

#### Google Cloud Storage

A small note about GCS - I'm going to call paths "directories", but in GCS it's
  all just naming semantics. `foo/bar/txt.yml` isn't a file in the directory
  `bar`, it's a file that has a name which happens to have slashes in it. The
  GCS tools just visualize them as directories to be nice.

1. Create a base directory named `<book-id>`
1. Upload JSON for base object to `<book-id>/<book-id>.json`
1. If there are any binary files attached, upload them to a `data` directory,
   like `<book-id>/data/<file-id>-<file-name>.<file-extension>`
1. For every child, recursively start at step 1, but start in a directory named
   after its hierarchy. IE, for a page, it would go into
   `<book-id>/data/<page-id>'

**Pros**:

1. Because there is no parent "manifest" that all children have to update
   through, we can parallelize uploads of content to preservation no matter
   where they go over an arbitrary number of machines.
1. Race conditions can be handled via Figgy's optimistic locking mechanism for
   each individual resource.
1. Versioning and checksums are a property of GCS. We just enable it on the
   bucket and don't have to do anything special.

**Cons**:

1. Prioritizing parallelization makes de-duplicating infeasible.
2. The format's not standard. It's easy to look at, but we can't point at a
   specification. At least it should be easy to convert to any of the other
   formats if we'd like to.
3. Migrating to a different platform is potentially more than a single copy
   operation - but at least GCS validates file integrity as part of the
   platform.
4. Migrating versions would mean we have to use their API - fortunately it's well
   documented and battle tested.

### Delete a Full Book

#### BagIt

Either don't delete anything or store bags in GCS and delete the parent
directory, relying on versioning.

#### OCFL

See Deletion in the [OCFL Implementation
Notes](https://ocfl.io/0.2/implementation-notes/#forward-delta)

1. Create a new `<book-id>/v2 directory.
2. Create a `v2/inventory.json` file with with a new `version` entry that has
   nothing in the `state` property.
3. Create a new `v2/inventory.json.sha512`
4. Copy the new `inventory.json` and `inventory.json.sha512` to the top
   directory.

There are unlikely to be locking problems, because nothing happens to the object
post-delete.

#### Google Cloud Storage

Enable versioning and delete all files that are in the parent `directory` (a
reminder there are no "directories", so no structure is left around.)

### Delete a page from a book which is already preserved.

#### BagIt

Rely on GCS versioning.

1. Upload the parent's new metadata file to `/<book-id>/metadata/<book-id>.json`
1. Delete the page's metadata and binary files
1. Update the `manifest` and `tagmanifest`

All of the same locking problems from "adding a book" exist here - you'll have
to lock the entire object hierarchy. This can probably be implemented as an
`after_delete` hook on the child object, but will have to be careful that locks
don't run into one another and the update of the parent object's membership
doesn't cause unnecessary changes in the manifests.

### OCFL

See Deletion in the [OCFL Implementation
Notes](https://ocfl.io/0.2/implementation-notes/#forward-delta)

1. Create a new `<book-id>/v2 directory.
2. Create a `v2/inventory.json` file with with a new `version` entry that
   doesn't have the now-deleted page's metadata and binary files in it
3. Create a new `v2/inventory.json.sha512`
4. Copy the new `inventory.json` and `inventory.json.sha512` to the top
   directory.

All of the same locking problems from "adding a book" exist here - you'll have
to lock the entire object hierarchy. This can probably be implemented as an
`after_delete` hook on the child object, but will have to be careful that locks
don't run into one another and the update of the parent object's membership
doesn't cause unnecessary changes in the manifests.

### Google Cloud Storage

1. Update the `<book-id>.json` which holds membership array.
2. Delete the child page's metadata and binary content.

These operations can happen independently of one another, and so can just be an
`after_save` and `after_delete` hook on those resources.

### Add a page to a book which is already preserved.

#### BagIt

There are a couple options here. We can either create a whole new bag, or rely
on GCS' versioning. I'm going to assume GCS versioning, because making a new bag
is pretty expensive.

1. Upload the parent's new metadata file to `/<book-id>/metadata/<book-id>.json`
1. Delete the page's old metadata and binary files.
1. Upload the page's new metadata and binary files.
1. Update the `manifest` and `tagmanifest`

All of the same locking problems from "adding a book" exist here - you'll have
to lock the entire object hierarchy.

#### OCFL

See Addition and Updating in the [OCFL Implementation
Notes](https://ocfl.io/0.2/implementation-notes/#forward-delta)

1. Create a new `<book-id>/v2` directory`
1. Create an `inventory.json`
1. Add the new `metadata` and `binary` files to `v2/content`
   directory
   * This will include the parent's new binary file.
1. Add the new `metadata` and `binary` files to the `manifest` key of
   `inventory.json`
1. Add the new `metadata` and `binary` files to the `state` key of
   `inventory.json`

All of the same locking problems from "adding a book" exist here - you'll have
to lock the entire object hierarchy.

#### Google Cloud Storage

1. Update the parent's `<book-id>.json` when the parent's membership is updated
1. Upload the new page's `metadata` and `binary` files with the appropriate
   names.

If any locking is necessary, it will only have to be those files with new
content, and so can be implemented as part of a `save` operation on a
per-resource basis.

### Preserve a Book with Books which have Pages (A multi-volume work)

The summary for this is just treat child books as if they're "pages", and allow
for everything to go arbitrarily deep. There's no real difference between this
and previous cases, except that Google Cloud Storage can handle each "volume"
without ever touching its parent. Deletions and additions of "pages" never have to go up more
than one level in the hierarchy.

## What did we do

We chose the Google Cloud Storage method, as seen in our [Architecture Decision
Record](https://github.com/pulibrary/figgy/blob/master/architecture-decisions/0003-preservation.md).

The cases above show that because of our choice to have a hierarchy of children
it was by far the easiest to implement, the least complex, the least likely to
break, and didn't require any special locking mechanisms. The implementation can
be seen [here](https://github.com/pulibrary/figgy/pull/2821).

Based on the above I personally recommend that if one chooses either OCFL or
BagIt that you either store everything flat (every "page"/"volume"/"book" in the
same object root) or have a very good and well-tested pessimistic locking
implementation.

However, our system is very new, so we'll see how things evolve!
