---
date: 2024-10-30 13:25:00 -0400
title: Migrating to Blacklight's Built-in Advanced Search
layout: default
---

## Migrating to Blacklight's Built-in Advanced Search
**by Christina Chortaria, Regine Heberlein, Max Kadel, Ryan Laddusaw, Kevin Reiss, and Jane Sandberg**

As part of migrating our catalog from Blacklight 7 to
Blacklight 8, we made the decision to move away from
the [blacklight_advanced_search gem](https://github.com/projectblacklight/blacklight_advanced_search)
in favor of the built-in
advanced search features that come with modern versions of
Blacklight.  This has been a long (18 months!) process, filled with
roadblocks and competing priorities.
While it took longer than we expected, we were able to do this
migration in small incremental steps that
  * migrated our catalog's two advanced search forms to use
    Blacklight's built-in advanced search features,
  * allowed us to set aside the work as needed and come back to
    it easily months later,
  * kept our catalog working and deployable throughout the process,
  * could be easily rolled back in case of a problem, and
  * didn't require the use of long-running (and frequently rebased) git branches.

This post describes our process, in the hopes that it is useful
to other Blacklight users who wish to implement the built-in
advanced search, or others who are interested in moving away from
a tightly coupled third-party dependency.
<!--more-->

### Blacklight's Built-in Advanced Search

Recent versions of Blacklight 7, and all versions of Blacklight
8 have an advanced search feature.  There is also a
[venerable blacklight_advanced_search gem](https://github.com/projectblacklight/blacklight_advanced_search)
which has historically provided this functionality, which is compatible
with Blacklight 7 but not 8.  In conversation with the wider Blacklight
community, in the interest of maintaining one less
dependency, we chose to invest our time into migrating to the built-in
feature, rather than trying to make the gem compatible with Blacklight 8.

The built-in advanced search uses a new (to us) way of communicating
with solr, called the JSON Query DSL.  This DSL is very expressive.  For
example, if you want to do a boolean query for materials about pets that
do not mention hamsters, but do mention cats or dogs, you can express it like so:

```json
{"query":{"bool":{
  "must":[{"edismax":{"query":"pets"}}],
  "must_not":[{"edismax":{"query":"hamsters"}}],
  "should":[{"edismax":{"query":"cats"}}],
  "should":[{"edismax":{"query":"dogs"}}]
}}}
```

In this example, `bool` refers to Solr's
[Boolean Query Parser](https://solr.apache.org/guide/solr/latest/query-guide/other-parsers.html#boolean-query-parser),
while `edismax` refers to Solr's
[Extended DisMax Query Parser](https://solr.apache.org/guide/solr/latest/query-guide/edismax-query-parser.html).  The boolean query parser can handle the boolean
logic of which terms should, must, or must not appear.  The edismax query parser
can then handle any stemming or boosts within the query terms themselves.

### ...but it didn't work
While experimenting with the built-in advanced search on
Solr 8 and 9, we and others in the Blacklight community found
that [it wasn't actually searching](https://github.com/projectblacklight/blacklight/issues/3042)!  After extensive
exploration with many helpful tips from David Kinzer, Ben 
Armintor, Michael Gibney, and others in the Blacklight
community, we identified [a bug introduced in Solr version 7.2](https://issues.apache.org/jira/browse/SOLR-16916). In this bug,
if you have `edismax` set as the default parser for a
request handler (as the default Blacklight config does,
as did our solr configuration), solr would parse a JSON query like

```json
{"query":{"bool":{"must":[{"lucene":{"query":"plasticity"}}]}}}
```

and think that the user is literally searching for terms like "bool" and "must", as well as the intended search term "plasticity".  In other words, Solr was not interpreting
`"bool"` as a cue to start using the Boolean Query Parser, but as a term in the
user's search query.

We submitted a patch to fix this Solr, which was released in version 9.4.  Our deepest thanks to David Smiley for his invaluable
and kind guidance on our first Solr patch, and for addressing
a regression that our patch caused.

However, now that it was fixed, we didn't want to add a major Solr migration
as yet another blocker to finishing the Blacklight migration.  Fortunately,
there turned out to be a relatively simple workaround to this bug.  We can create a second request handler that does not default
to the `edismax` query parser, and use this new request handler
for any queries that use the JSON Query DSL.  This workaround
is available in Blacklight 7.34.0 and above, just add the following to your catalog controller:

```ruby
config.json_solr_path = 'advanced' # or whatever you've named your new request handler
```

### Starting work behind feature flags

To keep our main branch deployable without keeping our work in a
long-running feature branch, we started migrating to the JSON 
Query DSL and the built-in advanced search form behind feature flags.
We used the [flipflop gem](https://github.com/voormedia/flipflop) to
manage the feature flags, which gives catalog administrator users the
ability to toggle feature flags in a convenient UI.

One gotcha with this approach was configuring fields to use the JSON
Query DSL conditionally based on the flag's value.  A search field that
uses the classic Solr query parameters is configured in the catalog controller
like so:

```ruby
    config.add_search_field('title', label: 'Title')
```

To configure it to use the JSON Query DSL, you specify what you want an individual
clause to look like:

```ruby
    config.add_search_field('title', label: 'Title') do |field|
      field.clause_params = { edismax: { qf: '${title_qf}', pf: '${title_pf}' } }
    end
```

Our first approach was to conditionally configure those clause params if the
feature flag was enabled:

```ruby
# Don't copy this example, it doesn't work well!
config.add_search_field('title', label: 'Title') do |field|
  field.clause_params = { edismax: { qf: '${title_qf}', pf: '${title_pf}' } } if Flipflop.json_query_dsl?
end
```

This sort of worked, but had a serious drawback.  This code was only evaluated when the Rails
application started up, so toggling the feature flag had no effect until after you
restarted the Rails process.

We instead found a [new approach](https://github.com/pulibrary/orangelight/pull/3701):
rather than consulting the feature flag during the initial field configuration in our Catalog Controller,
we consulted it where the configuration values are actually used, within our `SearchBuilder` class.  This allowed us to toggle the feature flag on and off as needed
while the application was still running.

### View components: a nice approach

We wanted this migration to be invisible
to our users, keeping the look and functionality of our existing advanced search forms.

Fortunately, the built-in advanced search form's front end is
written as a view component, which proved perfect for our use case.  Our
new forms are implemented as view components that inherit from the built-in
blacklight advanced form.  That means
that all the basic view logic of creating and populating an
advanced search form is done for us already, and we can add our
unique look and a tiny bit of additional view logic on top of it.
Here are the pull requests that introduced the view component-based
forms to our code, with the caveat that we have made various improvements
to them since then:

 * [View component-based numismatics search](https://github.com/pulibrary/orangelight/pull/3671)
 * [View component-based advanced search](https://github.com/pulibrary/orangelight/pull/3700)

View components are also fully compatible with the classic Rails
system of view partials and global helper methods: in any given
component, you can render any view partial or call any helper method you like.
This allowed us to share a great deal of code between the new
view component-based forms and the classic partial-and-helper
forms that were in production.  As we've implemented new features
and bug fixes in the classic production forms, the changes have
largely just appeared without any fuss in the new forms.


### Putting it into production: two more wins for feature flags

We thought we had this all figured out!  We'd done rigorous
testing within our team, and we decided it was time to flip
the feature flags to on and start using the JSON query DSL and
new forms in production.

Shortly after turning the forms on in production, we found out
about a problem we hadn't considered: a custom feature in our catalog called
left-anchored search.  This feature allows users to search for titles that
begin with a certain string.  Unfortunately, the search results for left-anchored
searches were returning significantly different results when using the JSON Query
DSL.  Thanks to feature flags, we could quickly switch back to using solr query
parameters while [resolving the issue](https://github.com/pulibrary/orangelight/pull/4168).

After this fix, we turned the feature on again, and it turned out to
be another false start.  When the features were toggled on, one of our
product owners noticed that the `OR` in boolean OR queries was
being ignored... not in the advanced search, but in the basic
search!  This turned out to be a specific setting in our solr
configuration.  Our `mm` was set to require 100% of terms to be
present in a document for it to appear in the search results when
using the Boolean query parser.  Once we identified the issue,
we were able to add some logic to our search builder to
conditionally set the `mm` to the correct value based on the user's query.

Finally, the third time was the charm!  We turned on the features
again, and everything worked!

As of today, we have completely removed the blacklight_advanced_search
gem, old forms, and feature flags from our catalog.  Thank you
for reading our saga, and best of luck on your own migrations!
