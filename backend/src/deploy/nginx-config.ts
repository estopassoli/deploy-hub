/**
 * Pure Nginx vhost generators.
 *
 * Key property: when a Let's Encrypt certificate already exists for the domain
 * (caller passes hasCert=true after checking /etc/letsencrypt/live/<domain>/),
 * the generated config keeps the plain :80 server AND adds a :443 ssl server
 * using that cert. This makes redeploys preserve HTTPS instead of overwriting
 * the certbot-managed config with an HTTP-only vhost (which would make the
 * domain fall through to nginx's 443 default_server — i.e. the wrong app).
 *
 * :80 keeps serving the app (no forced redirect) so certbot's nginx renewal
 * challenge on port 80 is never obstructed.
 */

export interface LeCertPaths {
  fullchain: string;
  privkey: string;
}

export function leCertPaths(domain: string): LeCertPaths {
  return {
    fullchain: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
    privkey: `/etc/letsencrypt/live/${domain}/privkey.pem`,
  };
}

function sslDirectives(domain: string): string {
  const { fullchain, privkey } = leCertPaths(domain);
  return `    ssl_certificate ${fullchain};
    ssl_certificate_key ${privkey};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;`;
}

/** Wrap a shared location/body block in an HTTP (:80) server, plus an HTTPS (:443) server when a cert exists. */
function wrap(serverName: string, domain: string | null | undefined, hasCert: boolean, body: string): string {
  const http = `server {
    listen 80;
    server_name ${serverName};

${body}
}
`;
  if (!domain || !hasCert) return http;
  return `${http}
server {
    listen 443 ssl;
    server_name ${serverName};
${sslDirectives(domain)}

${body}
}
`;
}

export function proxyVhostConfig(opts: { domain?: string | null; port: number; hasCert?: boolean }): string {
  const serverName = opts.domain || '_';
  const body = `    location / {
        proxy_pass http://127.0.0.1:${opts.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }`;
  return wrap(serverName, opts.domain, Boolean(opts.hasCert), body);
}

export function staticVhostConfig(opts: { domain?: string | null; appName: string; hasCert?: boolean }): string {
  const serverName = opts.domain || '_';
  const body = `    root /var/www/${opts.appName};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;`;
  return wrap(serverName, opts.domain, Boolean(opts.hasCert), body);
}
