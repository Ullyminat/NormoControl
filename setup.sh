#!/bin/bash

sudo apt update && sudo apt install -y curl git jq ufw

if [ ! -f /swapfile ]; then
    echo "Setting up 2GB Swap..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
else
    echo "Swap already exists."
fi

if ! [ -x "$(command -v docker)" ]; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
else
    echo "Docker already installed."
fi

echo "Starting containers..."
docker compose up -d

echo "===================================================="
echo "Deployment finished!"
echo "Make sure to edit Caddyfile with your domain."

echo "Configuring Firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "Then run: docker compose restart caddy"
echo "===================================================="
