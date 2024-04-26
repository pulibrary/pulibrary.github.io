---
date: 2024-04-10 13:25:00 -0400
title: Finding Things in Ansible return values
layout: default
---

## How to Find the Data You Need for an Ansible Task
**by Alicia Cozine, Francis Kayiwa, and Vickie Karasic**

When you develop an Ansible playbook, you sometimes need to use a single item in a huge flood of data. For example, we wanted to check the status of a single service on an Ubuntu machine, then run a task if the service did not already exist. Simple, right? Except your average Ubuntu machine has dozens if not hundreds of services, so there are many, many return values for ansible.builtin.service_facts.

Every time a similar situation arises, we find ourselves thinking, "I've been here before." And yet, we always have to figure out the answer from scratch. So the last time this happened, we decided to write a blog post. 

### Define your logic

The first step, which usually happens before you hit this challenge, is to define your logic. Usually you want to run a task only under certain conditions. For example, only compile a package if it is not already installed. Of course, in many cases Ansible takes care of this for you, but in some cases, it can't.

### Find the data

Once you know what logic you are pursuing, you need to find the data. In our example above, we needed information about running services. Usually the data you need will either be a fact, or a registered variable.

#### Gathering Ansible facts

By default, Ansible gathers basic information about the nodes it connects to - for example, operating system name and version, 
 (rapid7 playbook)

#### Registering variables

- registered variables (ruby_s role)

### Look at the data

The next step is to look at the data you get back. The debug module is your friend. Start with the most inclusive definition - the entire set of facts or the entire registered variable.

#### Home in the variable you want

## Examples

If you start with this data:

```vars.yml
create a vars file with sample data here
```

and run this playbook:

```playbook.yml
create a playbook with sample tasks (including fact gathering)
```

you get this output:

```bash
paste output here
```
