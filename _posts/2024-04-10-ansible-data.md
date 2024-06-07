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

We started with these tasks:

```yaml
- name: Gather MAC address of VM to replace
  community.vmware.vmware_vm_info:
    hostname: '{{ vcenter_hostname }}'
    username: '{{ vcenter_username }}'
    password: '{{ vcenter_password }}'
    validate_certs: false
    vm_name: "{{ vm_to_replace }}"
  register: vm_info

- name: Print out deleted VM information
  ansible.builtin.debug:
    msg: You will be deleting {{ vm_info }}

- name: Set powerstate of a virtual machine to poweroff by using UUID
  community.vmware.vmware_guest:
    hostname: "{{ vcenter_hostname }}"
    username: "{{ vcenter_username }}"
    password: "{{ vcenter_password }}"
    validate_certs: false
    datacenter: "{{ vcenter_datacenter }}"
    cluster: "{{ vcenter_cluster }}"
    uuid: "{{ vm_info.uuid }}"
    state: poweredoff
```

the debug task gave us this output:

```json
"msg": "You will be deleting {'changed': False, 'virtual_machines': [{'guest_name': 'sandbox-tw8766', 'guest_fullname': 'Ubuntu Linux (64-bit)', 'power_state': 'poweredOn', 'ip_address': '172.20.80.18', 'mac_address': ['00:50:56:ac:7d:7e'], 'uuid': '422cb961-2663-1edf-fb5b-694301d21623', 'instance_uuid': '502cdbb6-b22e-57cf-0396-3a57d433e439', 'vm_network': {'00:50:56:ac:7d:7e': {'ipv4': ['172.20.80.18/22'], 'ipv6': ['fe80::250:56ff:feac:7d7e/64']}}, 'esxi_hostname': 'lib-vmserv001b-dev.princeton.edu', 'datacenter': 'Library-Dev', 'cluster': 'VMCluster', 'resource_pool': None, 'attributes': {}, 'tags': [], 'folder': '/Library-Dev/vm/Discovered virtual machine', 'moid': 'vm-3596', 'datastore_url': [{'name': 'VMSANVOL005_05TB_3Par', 'url': '/vmfs/volumes/5ddd70a2-87f572d0-7b51-98f2b3f26eb6'}], 'allocated': {}}], 'failed': False}",
  "_ansible_verbose_always": true,
  "_ansible_no_log": null,
  "changed": false
```

and the next task failed with this error:

```yaml
"msg": "The task includes an option with an undefined variable. The error was: 'dict object' has no attribute 'uuid'. 'dict object' has no attribute 'uuid'\n\nThe error appears to be in '/runner/project/playbooks/utils/replace_vm_host.yml': line 27, column 7, but may\nbe elsewhere in the file depending on the exact syntax problem.\n\nThe offending line appears to be:\n\n\n    - name: Set powerstate of a virtual machine to poweroff by using UUID\n      ^ here\n",
}
```
So we knew the formulation of the variable `{{ vm_info.uuid }}` is wrong . . . but what is the correct formulation?

