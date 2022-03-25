---
date: 2022-03-25 15:00:00 -0400
title: Configuring blacklight_dynamic_sitemap
layout: default
---

## Configuring blacklight_dynamic_sitemap
**by [Bess Sadler](https://github.com/bess)**

For [pdc_discovery](https://github.com/pulibrary/pdc_discovery), a blacklight 
application at Princeton to improve findability for open access data sets, we 
want to publish a sitemap so that search engine crawlers can more easily index 
our content. [Orangelight](https://github.com/pulibrary/orangelight), 
Princeton's library catalog, which is also a 
[Blacklight](https://github.com/projectblacklight/blacklight) application, 
uses an older system, [blacklight-sitemap](https://github.com/jronallo/blacklight-sitemap). 
However, the `blacklight-sitemap` gem hasn't been updated in awhile, and using 
rake tasks to re-generate very large sitemaps is less than ideal because it 
takes time and the sitemaps become stale quickly. Given these drawbacks to our 
existing approach, I was excited to try the more recent solution in use at 
Stanford and Penn State (among others): [blacklight_dynamic_sitemap](https://github.com/sul-dlss/blacklight_dynamic_sitemap).

[Jack Reed](https://github.com/mejackreed), one of the authors of this 
solution, has a good [blog post](https://www.jack-reed.com/2020/01/10/sitemaps-that-scale.html) 
describing the strategy behind the gem. That article is a great place to get 
the high level overview of what's happening. To summarize, a sitemap can only 
contain 50k records, so we split our index into chunks such that the top level 
sitemap stays within that 50k limit, and each entry in the top level sitemap 
links to a sub-sitemap representing a chunk of the overall document collection. 
See Jack's article for a much more thorough explanation.

Implementing a dynamic sitemap in this way requires, as one might expect, 
adding the `blacklight_dynamic_sitemap` gem to one's Blacklight application. 
This part of the process went well and behaved exactly as described in the 
gem's README. However, getting it to work also requires configuring solr to 
calculate a hash value for each document, and that part gave me some trouble. 
I'm documenting it here for my own future reference and in case it helps anyone 
else. 

I don't know why exactly, but [the solr configuration recommended in the `blacklight_dynamic_sitemap`](https://github.com/sul-dlss/blacklight_dynamic_sitemap/blob/b0a90b48e7bc3f41e37e6b5b5bf35cad001e6bc1/solr/conf/solrconfig.xml#L19-L42) did not work for me. However, [a slightly different configuration](https://github.com/psu-libraries/psulib_blacklight/blob/7a6314977e9b014212b02d651d63780b40edcc10/solr/conf/solrconfig.xml#L59-L71), adapted from Penn State's implementation of the same solution, did work. The relevant stanza of my `solrconfig.xml` file now looks like this:

```
  <updateProcessor class="solr.processor.SignatureUpdateProcessorFactory" name="add_hash_id">
    <bool name="enabled">true</bool>
    <str name="signatureField">hashed_id_ssi</str>
    <bool name="overwriteDupes">false</bool>
    <str name="fields">id</str>
    <str name="signatureClass">solr.processor.Lookup3Signature</str>
  </updateProcessor>

  <updateRequestProcessorChain name="cloud" processor="add_hash_id" default="true">
    <processor class="solr.LogUpdateProcessorFactory"/>
    <processor class="solr.DistributedUpdateProcessorFactory"/>
    <processor class="solr.RunUpdateProcessorFactory"/>
  </updateRequestProcessorChain>
```

After putting that solr config in place and re-indexing my content, each record now has a field called `hashed_id_ssi`, the first digit of which determines which sitemap bucket it will appear in. A top level sitemap is available at `https://MY_APPLICATION_NAME/sitemap` and we're ready to set those indexing spiders loose on our data sets!

* [Here](https://datacommons.princeton.edu/discovery/sitemap) is our top-level dynamic sitemap in production.
* [Here](https://datacommons.princeton.edu/discovery/sitemap/0) is one of the sub-sitemaps, which contains links to actual objects to be spidered by web crawlers.
* [Here](https://github.com/pulibrary/pdc_discovery/pull/164/files) is the PR that added the sitemap functionality to our application.

Many thanks to my excellent colleague [Hector Correa](https://github.com/hectorcorrea) for helping me solve this.
