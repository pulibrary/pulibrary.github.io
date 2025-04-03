---
date: 2025-04-03 13:25:00 -0400
title: Troubleshooting RSpec load time
layout: default
---

## Troubleshooting RSpec load time
**by Jane Sandberg**

In one of our applications, we found that tests were taking quite some time to load.  For example, when running a relatively quick spec file, we got output like this:

```
bundle exec rspec spec/models/user_spec.rb

User
  #catalog_admin?
    identifies non-administrator users
    with an administrator
      identifies administrator users using the UID
  .from_cas
    finds or creates user in the database

Finished in 0.16932 seconds (files took 7.99 seconds to load)
3 examples, 0 failures
```

The tests themselves only took a fraction of a second, but the files took 8 seconds to load.
While not the end of the world, this did affect test-driven development, because even very
small changes still required that an annoying wait before you could see a passing or failing
test.

I felt that I got into a good rhythm troubleshooting this load time, and it helped to identify
two low-hanging fruit improvements, so I wanted to share my process.

<!--more-->

### Tools

I used three tools in my investigation:
* [ruby-prof](https://ruby-prof.github.io/) to identify which methods caused us trouble
* [debug.rb](https://github.com/ruby/debug) to identify why and how we were calling those methods in the first place
* [test-prof](https://github.com/test-prof/test-prof) -- this is an excellent tool, but I am an absolute beginner in using it, so I will focus on `ruby-prof` and `debug.rb` in this post.

### Profiling

1. Identify a test file in your test suite that is super fast by itself, but takes a lot of load time.  In this application, I used `spec/models/user_spec.rb`.
1. Add ruby-prof and debug.rb to your Gemfile with `bundle add ruby-prof debug`
1. Run ruby-prof to identify any methods that take more than 2% of the time with
`bundle exec ruby-prof -m2 $(bundle show rspec-core)/exe/rspec spec/models/user_spec.rb`

Within the output, you can find a table like this:

```
 %self      total      self      wait     child     calls  name                           location
 21.89      2.752     2.752     0.000     0.000        7   Kernel#`
 18.83     12.049     2.367     0.014     9.668     5716  *<Module::Kernel>#no_warning_require
  4.90      4.128     0.616     0.002     3.511     2217  *Kernel#require_relative
  2.06     12.426     0.259     0.000    12.167    65350  *Array#each
```

So: we are calling `` Kernel#` `` 7 times, and it seems that each call is expensive, since it adds up
to 2.75 seconds of the time it takes to run this test!  But... what the heck is `` Kernel#` ``?

### Debugging

To understand what `` Kernel#` `` is and how we can reduce the calls, I did the following

1. Run rspec with rdbg aka debug.rb: `bundle exec rdbg $(bundle show rspec-core)/exe/rspec spec/models/user_spec.rb`
1. Set a breakpoint on the method in question with: `` b Kernel#` ``
1. Press `c` to continue through the breakpoints to see the 7 occurrences in context: it turns out that these are shell commands run in backticks!
1. To get the backtrace of why a particular method is being called, enter `bt`.

As it turned out, we were running one shell command (needed for communication with a container in our development
environment) twice!  We only needed to run it once, and eliminating the extra command saved a whole second in the load time.

As for the `<Module::Kernel>#no_warning_require` and `Kernel#require_relative` calls -- these were almost all from loading
gems.  It turned out that our Gemfile contained several gems that we didn't need anymore, so removing those was a quick win.

These two low-hanging fruit improvements bring the load time for this test down by roughly 1 second each.  There is still
room for improvement of course!  For me, the load time is now fast enough to not be annoying, but if that changes in the
future, I will gladly reach for `ruby-prof`, `debug.rb`, and `test-prof` again.
