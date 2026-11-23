# Clé SSH de lab

`lab_ed25519` est une clé **de lab**, publique par construction : elle est commitée dans un dépôt que tout le
monde clone. Elle n'ouvre que les « serveurs » jetables du cours, qui ne publient aucun port hors de `127.0.0.1`.

Ne t'en sers jamais ailleurs. Une vraie clé privée ne se commite pas.

`usine` en installe une copie dans `~/.ssh/usine_lab` (droits `0600`, exigés par `ssh`) : Git ne conserve pas
ces droits, et un dossier monté depuis Windows ou macOS ne les garantit pas.

## Mot de passe de Vault de lab

`vault-pass.txt` est le mot de passe **de lab** avec lequel le lab `ansible` chiffre le mot de passe de la base
(`project/ansible/group_vars/web/vault.yml`). Il est commité pour que `usine rebuild` et `lab catchup` sachent
déchiffrer la solution sur tous les postes. Dans une vraie équipe, ce mot de passe ne vit jamais dans le dépôt.
