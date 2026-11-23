# Un « serveur » du cours : Debian, sshd, python3 (pour Ansible), utilisateur deploy avec sudo, clé de lab autorisée,
# Node.js 24 et le script de service de l'application (/etc/init.d/reservations).
# Sans systemd : sshd est le processus principal, les autres services se pilotent par leurs scripts d'init.
# Contexte de construction : le dossier infra/ (docker build -f infra/server/Dockerfile infra).

# Node.js vient de l'image officielle épinglée, la même que celle de l'application : rien à télécharger ailleurs.
FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS node

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

# Node.js 24 et npm.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && node --version && npm --version

# Le service de l'application : le code se dépose dans /opt/reservations, l'environnement dans
# /etc/reservations/reservations.env ; « sudo service reservations start|stop|restart|status ».
COPY --chmod=0755 server/reservations.init /etc/init.d/reservations
COPY --chmod=0644 server/reservations.default /etc/default/reservations
COPY --chmod=0755 server/start.sh /usr/local/sbin/server-start
RUN install -d -o deploy -g deploy -m 0755 /opt/reservations /var/log/reservations \
 && install -d -o deploy -g deploy -m 0750 /etc/reservations

EXPOSE 22 8080
# Relance le service s'il a déjà du code (redémarrage du conteneur), puis sshd au premier plan.
CMD ["/usr/local/sbin/server-start"]
