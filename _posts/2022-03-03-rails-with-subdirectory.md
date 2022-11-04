---
date: 2022-03-03 15:00:00 -0400
title: Rails Deployed to Subdirectory Behind a Load Balancer
layout: default
---

## Rails App Deployed to Subdirectory Behind a Load Balancer
**by Bess Sadler**

You know that sinking feeling you get when you've been working on an application for months, you're about to launch it, and then a new requirement appears at the last minute? It's been one of those weeks. However, after a couple of days of head scratching, I'm happy to report that we just might keep our launch schedule after all. 

The requirement in question *shouldn't* be hard. We need to take [PDC Discovery](https://github.com/pulibrary/pdc_discovery), PUL's new research data discovery application, and serve it out at a subdirectory. So, instead of delivering it at `https://pdc-discovery-prod.princeton.edu` (which we always knew was a placeholder), it needs to appear at `https://datacommons.princeton.edu/discovery/`. That `/discovery` at the end is the tricky bit.
<!--more-->

### Configuring the load balancer

All of our production servers are behind an [nginxplus](https://www.nginx.com/products/nginx/) load balancer. 

Here is our configuration to deliver load balancer requests with `/discovery` to our rails app, while allowing traffic that doesn't use that subdirectory to be routed elsewhere:

```
server {
    listen 443 ssl http2;
    server_name datacommons.princeton.edu;

    ssl_certificate            /etc/nginx/conf.d/ssl/certs/datacommons_princeton_edu_chained.pem;
    ssl_certificate_key        /etc/nginx/conf.d/ssl/private/datacommons_princeton_edu_priv.key;
    ssl_session_cache          shared:SSL:1m;
    ssl_prefer_server_ciphers  on;

    location /discovery/ {
        proxy_pass http://pdc-discovery-prod/discovery/;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache pdc-discovery-prodcache;
        # health_check interval=10 fails=3 passes=2;
        # allow princeton network only (until launch)
        include /etc/nginx/conf.d/templates/restrict.conf;
        # block all
        deny all;
    }

    include /etc/nginx/conf.d/templates/prod-maintenance.conf;

}
```

Surprising things that really matter:
1. The location line must have a slash before *and after* the subdirectory name
2. The `proxy_pass` also must include the `/discovery/`, again, with a slash before and after.
3. We had to disable the health check because it was causing the load balancer to time out and assume the service was down. This will be worth revisiting after launch. After all, there is a *reason* for health checks and we don't want to just leave it off forever.

### Configuring rails

Once we got the load balancer figured out, we had to configure the rails application to prefix all routes with `/discovery`, *and also* make sure that all assets, including compiled assets, expected that path as well. 

We had to take a few swings at this. There have been several approaches over the years, and there are many guides to this that no longer work in modern versions of rails. For example, many people will recommend using `RAILS_RELATIVE_ROOT` (which is how my colleague [Hector Correa](https://github.com/hectorcorrea) fixed this issue [back in 2017](https://github.com/Brown-University-Library/bul-search/blob/master/refresh.sh#L7-L10)). However, afaict [this is no longer supported](https://github.com/rails/rails/issues/2435). 

After some trial and error, and reading lots of documentation, here is what worked.

#### 1. Configure rack

In `config.ru`:

```
if Rails.env.production? || Rails.env.staging?
  map '/discovery/' do
    run Rails.application
  end
else
  run Rails.application
end
```

#### 2. Configure asset delivery

In `config/environments/production.yml`:

```
config.assets.prefix = "/discovery/assets/"
```

So, the end changes were relatively small to get this working, but figuring out WHAT small changes were needed was time-consuming. I hope writing this down saves someone (maybe even future me!) a headache.

Many thanks to my Princeton University Library colleagues who helped me solve this, especially [Francis Kayiwa](https://github.com/kayiwa) and [Hector Correa](https://github.com/hectorcorrea). 
