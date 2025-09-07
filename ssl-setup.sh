#!/bin/bash

# Install certbot
sudo apt update
sudo apt install -y certbot

# Stop nginx temporarily
docker-compose stop nginx

# Get SSL certificate
sudo certbot certonly --standalone \
  -d peptifit.delboysden.uk \
  --email craig.d.hart3@gmail.com \
  --agree-tos \
  --non-interactive

# Create SSL directory in project
mkdir -p nginx/ssl

# Copy certificates to project directory
sudo cp /etc/letsencrypt/live/peptifit.delboysden.uk/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/peptifit.delboysden.uk/privkey.pem nginx/ssl/

# Set permissions
sudo chown -R peptifit:peptifit nginx/ssl/

echo "SSL certificates installed. Now update nginx config and restart."
