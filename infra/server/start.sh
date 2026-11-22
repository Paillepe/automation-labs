#!/bin/sh
# Processus principal d'un serveur du cours : relance l'application si du code est déjà déployé
# (après un « docker restart »), puis sshd au premier plan. -e : journaux de sshd lisibles avec docker logs.
/etc/init.d/reservations start-if-deployed || true
exec /usr/sbin/sshd -D -e
