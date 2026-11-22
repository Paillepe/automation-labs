# Avant le cours — prépare ton poste

**À faire chez toi, avant mardi 24 novembre.** Compte 45 minutes, dont 30 de téléchargement sans rien toucher.
Le réseau de l'école ne suffira pas à télécharger les images le mardi matin : ce qui n'est pas fait chez toi
te coûtera la première heure de cours.

À la fin, la commande `usine doctor` doit afficher **« poste prêt »** ou **« poste utilisable »**.

Tout l'outillage du cours (Terraform, Ansible, kubectl, k3d…) vit dans un conteneur de développement.
Tu n'installes que trois choses sur ton ordinateur : Docker, VS Code et une extension.

## 1. Ce qu'il te faut

- Un ordinateur dont tu es administrateur, avec **8 Go de mémoire** au moins et **20 Go de disque libres**.
- Un **compte GitHub** (gratuit) : <https://github.com/signup>. Note ton identifiant, il servira dès mardi.
- Une bonne connexion pour cette préparation (environ 3 Go à télécharger).

## 2. Installe Docker, VS Code et l'extension

### Windows 10 ou 11

1. Ouvre **PowerShell en administrateur** et lance `wsl --install`. Redémarre. Au redémarrage, Ubuntu te demande
   de créer un utilisateur : fais-le.
2. Installe **Docker Desktop** : <https://www.docker.com/products/docker-desktop/>. À l'installation, laisse coché
   « Use WSL 2 instead of Hyper-V ».
3. Dans Docker Desktop : **Settings > Resources > WSL integration**, active l'intégration avec **Ubuntu**, puis
   « Apply & restart ».
4. Installe **VS Code** : <https://code.visualstudio.com/>, puis les extensions **WSL** et **Dev Containers**
   (éditeur : Microsoft).

> **Sous Windows, tout se passe dans Ubuntu (WSL).** Le dépôt doit être cloné dans le terminal Ubuntu, dans ton
> dossier personnel (`~`). Jamais sur `C:\`, jamais sous `/mnt/c` : ce serait très lent et des scripts casseraient.

### macOS (Intel ou Apple Silicon)

1. Installe **Docker Desktop** : <https://www.docker.com/products/docker-desktop/> (choisis la version de ta puce).
2. Installe **VS Code** : <https://code.visualstudio.com/>, puis l'extension **Dev Containers** (éditeur : Microsoft).

### Linux

1. Installe **Docker Engine** et le plugin Compose : <https://docs.docker.com/engine/install/>.
2. Ajoute ton utilisateur au groupe `docker` : `sudo usermod -aG docker $USER`, puis ferme et rouvre ta session.
3. Installe **VS Code** et l'extension **Dev Containers**.

## 3. Règle la mémoire de Docker

Docker doit disposer d'au moins **4 Go** de mémoire. C'est suffisant pour les quatre jours.

- **macOS** : Docker Desktop > **Settings > Resources > Memory**, puis « Apply & restart ».
- **Windows** : WSL prend par défaut la moitié de la mémoire du poste : avec 8 Go ou plus, il n'y a rien à faire.
  Si `usine doctor` annonce moins de 4 Go, crée le fichier `%UserProfile%\.wslconfig` avec ce contenu, puis lance
  `wsl --shutdown` dans PowerShell et redémarre Docker Desktop :

  ```ini
  [wsl2]
  memory=4GB
  ```

- **Linux** : rien à régler.

Avec 8 Go, ferme les applications gourmandes pendant le cours (navigateur à cinquante onglets, Teams, jeux).

## 4. Récupère le cours et ouvre l'environnement

Lance Docker Desktop et attends qu'il soit prêt. Puis, dans un terminal (**Ubuntu** sous Windows) :

```bash
git clone https://github.com/othila-academy/automation-labs.git
cd automation-labs
code .
```

Dans VS Code, une notification propose **« Reopen in Container »** : accepte. Si elle n'apparaît pas, ouvre la
palette de commandes (`F1`) et choisis **« Dev Containers: Reopen in Container »**.

La première ouverture construit l'environnement : **5 à 10 minutes**. Les suivantes prennent quelques secondes.
Quand c'est fini, le coin inférieur gauche de VS Code affiche « Dev Container: automation-labs ».

## 5. Télécharge les images, vérifie ton poste

Ouvre un terminal **dans VS Code** (menu Terminal > Nouveau terminal). Il s'ouvre dans l'environnement du cours.

```bash
usine pull
usine doctor
```

`usine pull` télécharge toutes les images des quatre jours. Si elle s'interrompt, relance-la : elle reprend où
elle s'était arrêtée.

`usine doctor` vérifie ton poste et te dit quoi faire pour chaque ligne :

- `✓` : c'est bon ;
- `⚠` : avertissement, le geste à faire est indiqué en dessous ;
- `✗` : bloquant, à corriger avant mardi.

Deux avertissements sont normaux à ce stade, tu les lèveras mardi avec le formateur : « Tu n'es pas connecté à
GitHub » et, parfois, « Ton identité Git n'est pas réglée ».

**Lundi soir, relance `git pull` puis `usine pull`** dans le même terminal : le cours aura reçu ses dernières
images.

## 6. Si ça bloque

Ne passe pas plus de 20 minutes sur un blocage. Envoie au formateur, **avant lundi soir** :

- ton système (Windows, macOS Intel, macOS Apple Silicon, Linux) et la mémoire de ton poste ;
- la sortie complète de `usine doctor`, ou une capture du message d'erreur.

| Symptôme | Geste |
|---|---|
| « Docker ne répond pas » | Docker Desktop n'est pas lancé, ou pas encore prêt (icône de la baleine fixe) |
| Windows : `docker` introuvable dans Ubuntu | Docker Desktop > Settings > Resources > WSL integration : active Ubuntu |
| « Reopen in Container » échoue tout de suite | Vérifie que l'extension Dev Containers est installée, redémarre VS Code |
| La construction échoue sur un téléchargement | Connexion coupée : `F1` > « Dev Containers: Rebuild Container » |
| `usine pull` : « toomanyrequests » | Le Docker Hub limite les téléchargements anonymes : attends une heure, ou `docker login` |
| `usine: command not found` | Tu es dans un terminal hors de l'environnement : ouvre-le depuis VS Code, après « Reopen in Container » |
| Un commit échoue avec « gpg failed to sign » | `git config --local commit.gpgsign false` |
| Windows : tout est très lent | Le dépôt est sous `C:\` ou `/mnt/c` : reclone-le dans `~` d'Ubuntu |

### En dernier recours : GitHub Codespaces

Si ton poste ne peut vraiment pas faire tourner Docker, l'environnement s'ouvre dans le navigateur. Sur la page
GitHub du dépôt : **Code > Codespaces > Create codespace on main**, en choisissant une machine **4 cœurs**.
Le quota gratuit d'un compte personnel couvre une trentaine d'heures sur cette machine : **arrête ton codespace**
à chaque pause (<https://github.com/codespaces>), et préviens le formateur que tu es dans ce cas.

## 7. Ce que tu n'as pas à faire

- Installer Terraform, Ansible, kubectl ou Node.js sur ton poste : tout est dans l'environnement.
- Créer un dépôt, un fork, une clé SSH : on le fera ensemble mardi matin.
- Comprendre ce que fait chaque outil : c'est l'objet des quatre jours.
