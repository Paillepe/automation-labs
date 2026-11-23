export const title = 'Résilience et mise à jour sans coupure';
export const steps = ['replicas', 'suppression', 'gel', 'secret', 'mise-a-jour', 'procedure', 'bonus-production'];
export const duration = '2 h 15';
export const summary = `Un seul pod : s'il est remplacé, le service s'interrompt. Ce lab rend l'application scalable (plusieurs réplicas
derrière le Service), résiliente (le cluster sait quand un pod est prêt, et quand il faut le redémarrer) et mise à
jour sans coupure. C'est le moment où toute l'usine tourne de bout en bout : un tag Git, le pipeline, le registre,
le cluster.

Les sondes : readiness (« prêt à recevoir du trafic ? » ; non : le pod sort des points de terminaison du Service,
sans redémarrer), liveness (« encore vivant ? » ; non, plusieurs fois : le kubelet redémarre le conteneur), startup
(laisse le temps de démarrer avant les deux autres). Requests : ce que l'ordonnanceur réserve pour placer le pod ;
limits : le plafond (au-delà de la mémoire, le conteneur est tué : OOMKilled). Stratégie RollingUpdate : maxSurge
(combien de pods en plus pendant la mise à jour), maxUnavailable (combien en moins). L'application aide : à l'arrêt
(SIGTERM), elle répond 503 sur /ready pendant 2 s avant de fermer, le temps que le trafic la quitte.
HPA (autoscaling horizontal) ajuste le nombre de réplicas à la charge ; PodDisruptionBudget limite les pods
arrêtés en même temps lors d'une maintenance.

Sécurité : un Secret n'est pas chiffré, il est encodé en base64 ; il sépare le mot de passe du Deployment et en
limite l'accès (RBAC : qui a le droit de lire quoi). NetworkPolicy : qui a le droit de parler à qui (la base
seulement depuis l'application). Provenance des images : votre cluster ne lance que ce que votre pipeline a publié
et étiqueté.

Mise à jour (couture avec le lab livraison) : la version 1.1.0 est un tag Git v1.1.0 que vous poussez ; votre
pipeline publie l'image, usine release 1.1.0 la charge, vous changez la version dans votre manifest.
Les checks de ce lab envoient du trafic par l'Ingress pendant qu'ils suppriment un pod ou relancent un déploiement :
ils comptent les requêtes en échec, jamais des durées. Jeton d'injection de pannes du cours : lab-fault-token.
Étapes replicas à procedure : le socle. Étape bonus-production : facultative.
Après npx lab catchup resilience : usine rebuild.

Inspiré du lab \`ckad-probes-all-types\` du catalogue \`kubernetes-dsoxlab-training\` de Stéphane Robert — blog.stephane-robert.info — adapté.
Inspiré du lab \`ckad-rolling-update-strategy\` du catalogue \`kubernetes-dsoxlab-training\` de Stéphane Robert — blog.stephane-robert.info — adapté.
Inspiré du lab \`ckad-secret-injection-protection\` du catalogue \`kubernetes-dsoxlab-training\` de Stéphane Robert — blog.stephane-robert.info — adapté.
Pour aller plus loin, après le cours : https://github.com/stephrobert/kubernetes-dsoxlab-training`;
export const objectives = [
  'faire tourner plusieurs réplicas, avec des sondes et des ressources bornées',
  'supprimer un pod ou figer un processus sans qu’aucune requête n’échoue',
  'mettre à jour sous trafic, d’un tag Git jusqu’au cluster, sans coupure',
  'sortir un mot de passe du Deployment dans un Secret'
];
