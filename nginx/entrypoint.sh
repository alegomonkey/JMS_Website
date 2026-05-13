#!/bin/sh
# Render nginx config from template using DOMAIN env var.
# Falls back to localhost if unset so the container is still useful for dev.
set -e
: "${DOMAIN:=localhost}"
export DOMAIN
envsubst '${DOMAIN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
