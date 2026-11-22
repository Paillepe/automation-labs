# Spike GitHub — à dérouler par Quentin (15 minutes)

Trois critères de la SPEC §3.2 n'ont pas été joués le 22 novembre, parce qu'ils créent un dépôt et un paquet sur
GitHub : `gh auth login` dans le devcontainer, un workflow et une image sur GHCR, le scénario via `devcontainers/ci`.
Ils répondent aussi aux questions de l'ADR-0002.

## 1. Créer le dépôt de test et lancer les deux workflows (sur ton poste, hors devcontainer)

```bash
tests/spike/github/preparer.sh /tmp/usine-spike
cd /tmp/usine-spike
gh repo create usine-spike --private --source . --remote origin --push
gh run watch            # choisis « spike », puis relance pour « ghcr »
gh run list
```

Attendu :

- workflow **spike** vert : le devcontainer se construit sur Linux amd64, puis `usine pull`, `usine doctor` et
  `tests/spike/run.sh` (k3d, Terraform, Ansible) passent. C'est la preuve « Linux » et « devcontainers/ci ».
  Note la durée du job : c'est le coût d'un rejeu en CI.
- workflow **ghcr** vert : le résumé du job affiche `ghcr.io/<toi>/usine-spike@sha256:…`.

## 2. Tirer l'image depuis le poste

```bash
docker pull ghcr.io/<toi>/usine-spike:$(git rev-parse HEAD)
```

- Dépôt privé : attendu **refusé** sans jeton. Puis :
  `gh auth refresh -h github.com -s read:packages && gh auth token | docker login ghcr.io -u <toi> --password-stdin`,
  et le `pull` passe. Note si la portée `read:packages` était nécessaire.
- Passe ensuite le dépôt en public (`gh repo edit --visibility public --accept-visibility-change-consequences`),
  pousse un commit vide, et regarde sur <https://github.com/<toi>?tab=packages> si le paquet d'un dépôt public
  est public. **C'est la réponse qui décide** si `usine deploy test` a besoin d'un jeton chez les étudiants.

## 3. `gh auth login` dans le devcontainer

Ouvre `/tmp/usine-spike` dans VS Code, « Reopen in Container », puis dans le terminal :

```bash
gh auth login            # GitHub.com, HTTPS, « Login with a web browser »
gh auth status           # note les portées : « workflow » y est-elle ?
usine doctor             # la ligne GitHub doit passer au vert
git commit --allow-empty -m "Essai de push depuis le devcontainer" && git push
```

Attendu : le navigateur de l'hôte s'ouvre (ou le code à huit caractères s'affiche), le `push` passe en HTTPS sans
redemander de mot de passe.

## 4. Fork (ADR-0002)

Avec un second compte, ou en demandant à un collègue : forker un dépôt public qui porte une étiquette, et noter
si l'étiquette est dans le fork, et si l'onglet Actions demande une activation.

## 5. Codespaces

Sur la page du dépôt de test : **Code > Codespaces > Create codespace on main** (4 cœurs). Dans le terminal :
`usine pull && usine doctor && tests/spike/run.sh`. Attendu : tout passe ; `usine` écrit les noms des conteneurs
dans `/etc/hosts` (le devcontainer est en réseau host).

## 6. Nettoyer

```bash
gh repo delete usine-spike --yes
```

et supprime le paquet `usine-spike` dans <https://github.com/<toi>?tab=packages>.
