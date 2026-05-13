#!/bin/sh
# Pick the nginx config template based on whether Let's Encrypt has
# issued a cert for $DOMAIN yet. Without this split, the 443 server block
# references cert files at parse time and nginx refuses to start on first
# boot — which prevents Certbot from completing its HTTP-01 challenge.
set -e
: "${DOMAIN:=localhost}"
export DOMAIN

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    TEMPLATE=/etc/nginx/conf-templates/default.full.conf.template
else
    TEMPLATE=/etc/nginx/conf-templates/default.http.conf.template
fi

envsubst '${DOMAIN}' < "${TEMPLATE}" > /etc/nginx/conf.d/default.conf
