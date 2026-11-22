# Un « serveur » du cours : Debian, sshd, python3 (pour Ansible), utilisateur deploy avec sudo, clé de lab autorisée.
# Sans systemd : sshd est le processus principal, les autres services se pilotent par leurs scripts d'init.
# Contexte de construction : le dossier infra/ (docker build -f infra/server/Dockerfile infra).
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl openssh-server python3 sudo \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/sshd \
 && useradd --create-home --shell /bin/bash deploy \
 && echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy \
 && chmod 0440 /etc/sudoers.d/deploy \
 && printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/lab.conf

COPY --chown=deploy:deploy --chmod=0600 keys/lab_ed25519.pub /home/deploy/.ssh/authorized_keys
RUN chmod 0700 /home/deploy/.ssh

EXPOSE 22
# -e : les journaux de sshd sur la sortie d'erreur, lisibles avec docker logs.
CMD ["/usr/sbin/sshd", "-D", "-e"]
