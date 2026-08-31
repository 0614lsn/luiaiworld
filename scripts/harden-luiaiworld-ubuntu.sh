#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Unable to read /etc/os-release." >&2
  exit 1
fi

. /etc/os-release
if [[ ${ID} != ubuntu ]]; then
  echo "This script only supports Ubuntu." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

apt-get update
apt-get -y upgrade
apt-get -y install ufw fail2ban unattended-upgrades

install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/20-luiaiworld-hardening.conf <<'EOF'
AllowUsers ecs-user
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
MaxSessions 4
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitTunnel no
EOF
chmod 0644 /etc/ssh/sshd_config.d/20-luiaiworld-hardening.conf
sshd -t

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
chmod 0644 /etc/apt/apt.conf.d/20auto-upgrades

install -d -m 0755 /etc/fail2ban
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
backend = systemd
ignoreip = 127.0.0.1/8 ::1
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
maxretry = 4
bantime = 1h
findtime = 10m
EOF
chmod 0644 /etc/fail2ban/jail.local

ufw default deny incoming
ufw default allow outgoing
ufw limit OpenSSH comment 'SSH rate limited'
ufw --force enable

systemctl enable --now fail2ban
systemctl restart fail2ban
systemctl enable --now unattended-upgrades
systemctl reload ssh

systemctl is-active ssh
systemctl is-active fail2ban
ufw status verbose
