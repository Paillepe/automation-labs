#!/bin/sh
# Processus principal d'un serveur du cours : relance l'application en arrière-plan si du code est déjà déployé
# (après un « docker restart »), et sshd au premier plan, sans attendre. -e : journaux de sshd dans docker logs.
/etc/init.d/reservations start-if-deployed &
exec /usr/sbin/sshd -D -e
