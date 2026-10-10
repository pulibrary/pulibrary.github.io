---
date: 2026-10-09 11:25:00 -0400
title: Some ideas on refactoring disposable, mutable objects
layout: default
---

## Some ideas on refactoring stateful throwaway objects
**by Jane Sandberg**

We are migrating our [Lib-Jobs application](https://github.com/pulibrary/lib_jobs/)
from Rails to [Hanami](https://hanakai.org/hanami).  Part of the work is to make good use of
[Hanami's Dependency Injection framework](https://hanakai.org/learn/hanami/v3.0/app/container-and-components),
which means that our classes should be:
* stateless, and
* not "throw-away" classes, and
* ideally, use `#initialize` only to inject dependencies
<!--more-->

The idea of "throw-away" classes comes from
[this talk by Piotr Solnica](https://youtu.be/rMxurF4oqsc?si=9aKVA4kL10hoqEED&t=748).
Hearing him describe throw-away objects was a huge eye-opener for
me, because I have written countless classes that fall into this
category, and I had never thought about it before:
> So when we use this object, we can instantiate it with the hash,
for the sake of simplicity.  Then we call it, and then what?
Then we can't do anything about it, it's just a throw-away object,
because we use it once, and we cannot reuse it anymore.

When our classes are stateless, are not "throw-away" classes,
and use`#initialize` only for dependency injection, we can safely use
[Hanami's memoization feature](https://hanakai.org/learn/hanami/v3.0/app/container-and-components#memoization)
(enabled by default), which reuses a single instance of the
class wherever it is needed.  It's a nice speed boost --
but these practices also give our code a nice understandability boost!

Here are some simplified examples of how to refactor classes
for these goals, including some challenges and how we have approached
them.  Although Hanami has some wonderful structures that help
you to write code in this way
([operations](https://hanakai.org/learn/hanami/v3.0/operations)
being one of my favorites!), none of the following refactorings
rely on anything Hanami-related. You can enjoy these in any Ruby
code you want!

### The basic case

Here is a very basic class: it takes in some data in `#initialize`,
transforms the data when you call `#convert`, and then you throw
it away and move on with the rest of your program:

```ruby
# Before
class MyClass
  def initialize(data)
    @data = data
  end
  
  attr_reader :data
  
  def convert = data.map { it.process }
end
```

Here is the refactor -- much more concise, it leaves the
initializer free for dependency injection should it be
needed in the future, there is no mutation, and it is
reusable:

```ruby
# After
class MyClass
  def convert(data) = data.map { it.process }
end
```

### A memoization bug

Here's a simplified version of a bug we found early in our
migration!  First, the original (working) version:

```ruby
# Before
class MyClass
  def call
    @csv ||= CSV.generate do |csv|
      RecordList.new.call.each { |record| csv << record.to_a }
    end
  end
end
```

Our first attempt injected the `RecordList` dependency and
also injected this class into some other classes:

```ruby
# First version (buggy)
class MyClass
  # Hanami uses `Deps` to inject dependencies, here
  # `record_list` is an instance of the `RecordList` class
  include Deps['record_list']
  def call
    @csv ||= CSV.generate do |csv|
      record_list.call.each { |record| csv << record.to_a }
    end
  end
end
```

The issue: we found ourselves with stale data in this CSV -- it
never seemed to have the most up-to-date data.  `RecordList#call`
still was returning fresh data, but since we memoized this whole
CSV generation into an instance variable called `@csv`, we never
actually attempted to get new data.

Once we uncovered the issue, the fix was simple, remove `@csv ||=`:

```ruby
# Second version (works)
class MyClass
  include Deps['record_list']
  def call
    CSV.generate do |csv|
      record_list.call.each { |record| csv << record.to_a }
    end
  end
end
```

### A method that generates multiple things of interest

Here's a simplification of the original class.  Note that `#convert` returns
a value, but there is also an array of problems that other classes might be
interested in:

```ruby
# Before
class MyClass
  def initialize(data)
    @data = data
    problems = []
  end
  
  attr_reader :data, :problems
  
  def convert
    data.map do |element|
      processed = it.process
      problems << processed.problem if processed.problem
      processed
    end
  end
end
```

You are intended to use it something like this:

```ruby
# Before
my_object = MyClass.new(data)
transformed = my_object.convert
raise 'Oh no, there were problems!' if my_object.problems.any?
```

You have to be quite careful accessing the `#problems`!  If you call
`#problems` before `#convert` has been run, it will look like there
are no problems, even if there are some!  If you run `#convert`
multiple times, you might end up with many duplicate problems.

The original class considers `#problems` and the return value of `#convert`
to be two separate types of thing, but what if we consider them
to both be outputs of the `#convert` method?  Here, we
create a quick immutable struct named `Report` that tells the caller both
about the transformed data, and any problems encountered along the way:

```ruby
# After
class MyClass
  Report = Data.define(:data, :problems)

  def convert(data)
    data, problems = data.reduce([[], []]) do |(data, problems), row|
	    processed = row.process
      if processed.problem
        [data + [processed], problems + [processed.problem]]
      else
        [data + [processed], problems]
      end
	  end
	Report[data:, problems:]
  end
end
```

And you can call it like so:

```ruby
# After
my_object = MyClass.new
report = my_object.convert(data)
transformed = report.data
raise 'Oh no, there were problems!' if report.problems.any?
```

Or if you are very fancy and want to use destructuring:

```ruby
my_object = MyClass.new
my_object.convert(data) => data: transformed, problems:
raise 'Oh no, there were problems!' if problems.any?
```

### There are just too many params!

Consider the next example.  If we want to stop using `#initialize` for anything other than
dependency injection, we are going to have a very long parameter list in `#convert`!

```ruby
# Before
class MyClass
  def initialize(data:, regex_1: /.*/, regex_2: /\d/, min:, max:)
    @data = data
    @regex_1 = regex_1
    @regex_2 = regex_2
    @min = min
    @max = max
  end
  
  attr_reader :data, :regex_1, :regex_2, :min, :max
  
  def convert(processor_id:, org_unit:)
    #implementation here
  end
end
```

Instead, let's do a very classic refactoring "Introduce Parameter Object" (one of Martin Fowler's
catalog of refactorings covered in his book 
[Refactoring: Improving the Design of Existing Code](https://search.worldcat.org/title/1082143686)).
I've been enjoying using [Ruby's Data class](https://docs.ruby-lang.org/en/4.0/Data.html) to create
simple struct-like objects lately, so of course I did that:

```ruby
# After
class MyClass
  Context = Data.define(:data, :regex_1, :regex_2, :min, :max, :processor_id, :org_unit) do
    # The syntax to provide default values is a little awkward, but hopefully not the worst
    # code you see today!
    def initialize(regex_1: /.*/, regex_2: /\d/, **) = super
  end
  
  def convert(context)
    #implementation here
  end
end
```

Then you can call it like so:

```ruby
context = MyClass::Context[data: [], min: 5, max: 10, processor_id: 123, org_unit: 12]
my_object.convert(context)
```

Is it still awkward to have to deal with 7 different values... yes!  It is!  But, this
class is no longer holding us back from the delights of Hanami Dependency Injection,
so let's enjoy it!

### Closing thoughts

Even if you have been working with Ruby and Object Oriented Programming for a long time,
working with Hanami will teach you new things about the things you thought you knew!
Although I had worked with dependency injection systems in other languages before, it
was only when I started working on this migration that I really understood the distinction
between throw-away objects vs. objects that can be useful many times.  It is changing the
way I write Ruby classes!

