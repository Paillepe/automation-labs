export const title = 'Orchestration';
export const steps = ['deployer', 'service', 'ingress', 'declaratif', 'bonus-rangement'];
export const duration = '2 h 30';
export const summary = `Vos deux serveurs web tournent, mais si l'un tombe, personne ne bascule son trafic, et chaque mise à jour modifie
des machines qui durent. Un orchestrateur change de modèle : on ne configure plus des serveurs, on déclare ce qui
doit tourner (cette image, en tant d'exemplaires, joignable par ce nom), et le cluster s'en charge en continu.

Architecture de Kubernetes : le plan de contrôle (serveur d'API, etcd qui garde l'état voulu, l'ordonnanceur qui place
les pods, les contrôleurs) et les nœuds (kubelet, qui fait tourner les pods de son nœud). Boucle de réconciliation :
chaque contrôleur compare sans cesse l'état voulu et l'état réel, et agit pour les rapprocher. Un Deployment veut
N pods d'un gabarit : il crée un ReplicaSet, qui crée les pods. Un Service donne un nom et une adresse stables à un
ensemble de pods, choisis par leurs labels (ClusterIP : dans le cluster ; NodePort, LoadBalancer : vers l'extérieur).
Un Ingress route le trafic HTTP de l'extérieur vers des Services, par nom d'hôte et chemin ; un contrôleur Ingress
l'applique (ici Traefik, fourni par k3s ; ingress-nginx n'est plus maintenu depuis mars 2026). Gateway API est la
suite d'Ingress, plus riche : à connaître, sans lab. Docker Swarm répond au même besoin, plus simplement et avec moins
d'écosystème.

Le cluster est k3d (k3s dans Docker), fourni : usine up cluster. La base de données y est déjà, fournie elle aussi :
hôte db.data, base et utilisateur reservations, mot de passe lab-cluster-password (Secret data/db-credentials).
L'image est celle de votre pipeline (couture avec le lab livraison) : usine release 1.0.0 la tire de votre registre
(ghcr.io/<vous>/<dépôt>:1.0.0) et la charge dans le cluster sous le nom fixe reservations:1.0.0, celui que citent
vos manifests. Sans image publiée, ou sans réseau, elle la construit sur votre poste et le dit.
Tout se décrit dans project/k8s/ et s'applique par kubectl apply -f project/k8s/. Rien à la main.
Étapes deployer à declaratif : le socle. Étape bonus-rangement : facultative.
Après npx lab catchup cluster : usine rebuild (il recrée le cluster, recharge l'image et applique vos manifests).`;
export const objectives = [
  'déployer l’image publiée par son pipeline sur un cluster Kubernetes',
  'exposer l’application dans le cluster (Service) puis à l’extérieur (Ingress)',
  'décrire tout l’état voulu dans des fichiers et le vérifier par kubectl diff',
  'expliquer la boucle de réconciliation'
];
