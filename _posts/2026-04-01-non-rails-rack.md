---
date: 2026-04-01 13:25:00 -0400
title: Migrating from Rails to Rack
layout: default
---

## Migrating from Rails to Rack
**by Christina Chortaria, Carolyn Cole, Ryan Laddusaw, and Jane Sandberg**

### Technology Decision

[Allsearch](https://allsearch.princeton.edu/) is a search application with a VueJS
frontend and a Ruby backend.  The backend was originally in Rails, but we decided
to move it to Rack.  We chose Rack because it allowed us to do an in-place
conversion -- Rails applications are Rack applications already, we just needed to
remove and replace the Rails pieces.  Deepening our understanding of Rack would also help
us in our work with any Rack-based application, whether it is Rails, Hanami, or
just Rack.

We also replaced ActiveRecord with ROM.

### Challenges

* Rom-RB is an excellent replacement for ActiveRecord, with better performance
  and separation of concerns. However, there is definitely a learning curve to understanding
  the abstractions that it provides.  And moving from Rails migrations to
  Rom/Sequel migrations is a lot of work.
* `rswag` is an excellent gem for generating OpenAPI/Swagger documentation.
  Unfortunately, since it is Rails-based, we had to say goodbye to it in
  favor of a hacky OpenAPI/Swagger generator with a similar syntax.


### Successes

* Working on Allsearch now feels like writing Ruby again, rather than muddling
  around with Rails configurations.
* Although we are moving away from Rails in this application, we also learned
  about the internals of Rails that will be useful in maintaining our remaining
  Rails applications.
* Working with Rom-RB and Dry-RB provided some new patterns and helped view our
  code in a new way.
* Using the dry-monads Maybe was a nice replacement for Rails' `present?` and
  `blank?` methods that made the code more explicit about possible states.

### Key Concepts

* Rack application
* Rack middleware
* ROM relation
* ROM repository
* Dry-rb Maybe monad

### Conversion Process

Many Rails features had one-on-one replacements that you can adopt incrementally.
We were able to do the following without much friction:

* A simple rails controller can be easily rewritten as a simple Rack application.
  All of the controllers in Allsearch had just a single action, so we used the following process:
  1. change the action's method name to `call`
  1. change the return value of the method to fit the Rack specification
  1. keep all of our business logic intact
  1. slightly change the route
* The Rails `delegate` method has a direct equivalent in pure Ruby: `def_delegators`
* `Rack::Test` was very familiar after working with rails-rspec system tests
* `DatabaseCleaner` was a great replacement for rails-rspec transactional features

Replacing the Rails router was an incremental process.  We first used `Rack::Builder` and
its `map` method to create a Rack application that routed to all our Rack Applications,
and pointed our Rails router to this new "Router" application.
Rails' router is tightly integrated into the built-in Rails initializers.  Before we
could completely replace the Rails router with our own, we had to replace the
`Rails.application.initialize!` call to a new initialization process that is more
selective about which of Rails' built-in initializers are run.

Zeitwerk is a nice autoloader.  However, we can't use our own autoloader and the Rails
autoloaders at the same time.  The answer is the same as the routing: replace
`Rails.application.initialize!` with a more selctive initialization process that does
not create Rails autoloaders.


