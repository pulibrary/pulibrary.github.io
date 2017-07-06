# `pulibrary.github.io`

Source for pulibrary.github.io


## Run Locally

Clone the repo and then:

```
$ bundle install
$ bundle exec jekyll serve
```

and visit (http://localhost:4000)[http://localhost:4000].

## To Add a Post

Create a file in `_posts` using the naming convention `yyyy-mm-dd-slug.md`. This will inform the URL for the post, e.g. `2017-07-05-foo.md` will have the URL `https://pulibrary.github.io/2017-07-05-foo`.

The file must contain a YAML header with three properties, followed by the page content in [Kramdown](https://kramdown.gettalong.org/) e.g.:

```
---
date: 2017-07-05 15:00:00 -0400
title: Bar
layout: default
---

# Foo!

This is my post.
```

## And [Here is a Cycling Fish](https://giphy.com/embed/l46C9fDGilW6VoDGE)

[Really!](https://giphy.com/embed/l46C9fDGilW6VoDGE)
