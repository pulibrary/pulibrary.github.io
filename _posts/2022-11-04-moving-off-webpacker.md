---
date: 2022-11-04 13:25:00 -0400
title: Moving Rails Apps off of Webpacker
layout: default
---

## Moving Rails Apps off of Webpacker
**by Anna Headley, Carolyn Cole, Eliot Jordan, Jane Sandberg**

It is thankfully time to excise webpacker from all our Rails applications, and there are a lot of options for which tools to adopt.

For more background, see
* [DHH's summary of JavaScript in Rails 7](https://world.hey.com/dhh/rails-7-will-have-three-great-answers-to-javascript-in-2021-8d68191b)
* The [Rails 7 release announcement](https://rubyonrails.org/2021/12/15/Rails-7-fulfilling-a-vision)
* Rails Guides on [Working with Javascript](https://guides.rubyonrails.org/working_with_javascript_in_rails.html) and the [Asset Pipeline](https://guides.rubyonrails.org/asset_pipeline.html)

Our Rails apps at PUL are not running on Rails 7 yet but we have been moving off
of webpacker in preparation for this upgrade, and because webpacker is no longer
supported. A number of us have tried a variety of options on a variety of apps,
and we summarize our experiments and reflections here.

### Vite

On the Digital Library Services (DLS) team we've landed on Vite as a nice option
for serving both javascript and CSS. It's similar to jsbundling-rails but has
more features, and admittedly a smaller adoption footprint. We tried migrating one app to
jsbundling-rails and then to Vite. They are very similar under the hood, and the
changes we made to our actual javascript were similar. We found the Vite
configuration slightly simpler, especially with respect to filename conventions
and serving through Vite and sprockets at the same time. Because of this
and Vite's larger feature set we've decided to move forward using Vite for now.

[DPUL](https://github.com/pulibrary/dpul/pull/1380) is the only app that DLS has migrated so far. We also tried migrating our largest app [Figgy](https://github.com/pulibrary/figgy), but found ourselves blocked by tricky dependency management in one of the libraries we use. We are planning to remove this library from Figgy eventually, so we set aside the migration for now. Since the blocker came up in the esbuild configuration, it was an issue in both Vite and jsbundling-rails.

The Discovery and Access Services team migrated the Blacklight Catalog application [Orangelight](https://github.com/pulibrary/orangelight/pull/3164) to Vite as well.
We looked into moving some of our Sprockets usage to Vite as well, but decided to keep our scope limited to the webpacker-to-vite migration.
With the help of [Vite's migration guide](https://vite-ruby.netlify.app/guide/migration.html#webpacker-%F0%9F%93%A6), this was a smooth transition.

On the Research Data and Scholarship Services (RDSS) team we utilized Vite after DLS and DACS each converted one of thier repositories. [pdc_describe](https://github.com/pulibrary/pdc_describe/pull/397/files) was converted to utilize vite and the transition went smoothly.

#### Vite tips / lessons learned

- Learn to pronounce it!: https://vitejs.dev/guide/#overview
- Vite does not allow for (or need) testing assets to be served from the [development server](https://github.com/pulibrary/pdc_describe/pull/403).
- If you import any files that have a file extension other than `.js`, you will need to include
the file extension when importing it.  We had a few files with an `.es6` file extension, so we
had to change this:

      import BookCoverManager from '../orangelight/book_covers'

    to this:

      import BookCoverManager from '../orangelight/book_covers.es6'

#### But what's it like to work with?

Migration is only the first step, right? On DLS, we haven't had a work cycle yet
with the app we moved to Vite so we can't speak much to the developer
experience. It is straightforward to run `bin/vite dev` and have autoreloading
if you don't want to refresh your browser to see changes.

On DACS, we have made some small changes to Orangelight's javascript since moving to Vite,
and haven't noticed much difference from our previous experience with webpacker.

### Importmaps

The new default option for new projects serving javascript in Rails 7 is Importmaps. Importmaps is supposed to allow you to manage your javascript dependencies
without having node installed. It's the simplest of the new options so on DLS we
tried it with our simplest rails app. Like all our other apps, this one uses our
vue.js-based design system, [lux](https://github.com/pulibrary/lux). We got
pretty far with importmaps (and dartsass-rails), but we weren't able to get this
integration with our design system. My speculation is that lux would need to
provide a node package that bundles the full source for all its dependencies? This is partially based on a [DHH
post](https://discuss.rubyonrails.org/t/rails-es6-based-replacement-for-webpacker/78656/7)
where he says, "I’d love to see a method that downloads the pinned dependencies
at some point, but it’s not trivial for packages that have nested dependencies,
which haven’t been bundled into a single dist file."

### Jsbundling-rails with esbuild

Rails 7 can also generate project with traditional javascript bundling tools such as esbuild using the jsbundling-rails gem. This seems to be the most common path away from webpacker. DLS tested this migration on Figgy, our largest app. The initial upgrades went smoothly and there was lots of primary and secondary documentation online. The configuration ended up feeling awkward and we decided to use Vite instead.

### Shakapacker

The last option we explored for replacing webpacker is [Shakapacker](https://github.com/shakacode/shakapacker), a webpacker fork. We tried Shakapacker in [pdc_discovery](https://github.com/pulibrary/pdc_discovery/pull/307).  It went relatively smoothly, but we never decided to put it into production.

### General tips / lessons learned

- Whichever webpacker replacement you choose, if you load both local javascript and vue.js components, you have to be careful about how you order them. Vue.js takes over the eventing system so once it's been initialized you can't bind events from your local code anymore. Here's a [vue issue about it](https://github.com/vuejs/vue/issues/3587).
