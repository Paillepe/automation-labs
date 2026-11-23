export const title = 'Infrastructure en code';
export const steps = ['srv-test', 'serveurs', 'isolation', 'derive', 'bonus-variable'];
export const duration = '2 h';
export const summary = `srv-test a été créé par une commande du cours. Personne dans votre équipe ne saurait le refaire à l'identique :
ce qui le décrit n'est pas dans votre dépôt. L'infrastructure en code (IaC) règle ça : vous décrivez l'état voulu
(réseaux, serveurs, base) dans des fichiers versionnés, et l'outil calcule ce qu'il faut créer, modifier ou détruire
pour l'atteindre.

Déclaratif ou impératif : deploy.sh disait comment faire, étape par étape ; un fichier Terraform dit ce qui doit
exister. Le cycle : terraform init (prépare le dossier, installe le provider), terraform plan (compare le code, le
state et la réalité, et affiche les changements), terraform apply (les applique), terraform destroy (détruit tout).
Le state (terraform.tfstate) est la mémoire de Terraform : ce qu'il a créé, avec leurs identifiants. En équipe, il
vit dans un backend distant (un bucket S3, Terraform Cloud), avec un verrou pour que deux apply ne se croisent pas.
Il contient des secrets en clair (ici, le mot de passe de la base) : il ne se commite jamais (.gitignore).
Une dérive (drift), c'est la réalité qui a changé sans passer par le code : plan la détecte, apply la corrige.

Ici, le provider est Docker (kreuzwerker/docker) : vos « serveurs » sont des conteneurs. Sur un cloud, le même code
déclarerait des machines virtuelles, des sous-réseaux et des groupes de sécurité ; les réseaux front et back de ce lab
en sont l'équivalent local. OpenTofu, le fork libre de Terraform, lit les mêmes fichiers.

Exigence de l'exercice 3 : les étapes de déploiement sont décrites. Elles le sont dans le code (project/infra/) et
dans la sortie de terraform plan, que vous savez lire.
Fourni : project/infra/ (provider, variables, les deux images, sorties attendues à décommenter).
Étapes srv-test à derive : le socle. Étape bonus-variable : facultative.
Après npx lab catchup terraform : usine rebuild.

Inspiré du lab \`aws/import-moved-drift\` du catalogue \`terraform-dsoxlab-training\` de Stéphane Robert — blog.stephane-robert.info — adapté.
Inspiré du lab \`first-infra/virtual-network\` du catalogue \`terraform-dsoxlab-training\` de Stéphane Robert — blog.stephane-robert.info — adapté.
Pour aller plus loin, après le cours : https://github.com/stephrobert/terraform-dsoxlab-training`;
export const objectives = [
  'décrire des réseaux, des serveurs et une base dans des fichiers Terraform',
  'lire un plan, appliquer, et vérifier que la réalité correspond au code',
  'isoler la base sur un réseau que seuls les serveurs web rejoignent',
  'détecter une dérive avec plan et la corriger avec apply'
];
