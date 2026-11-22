# Clé SSH de lab

`lab_ed25519` est une clé **de lab**, publique par construction : elle est commitée dans un dépôt que tout le
monde clone. Elle n'ouvre que les « serveurs » jetables du cours, qui ne publient aucun port hors de `127.0.0.1`.

Ne t'en sers jamais ailleurs. Une vraie clé privée ne se commite pas.

`usine` en installe une copie dans `~/.ssh/usine_lab` (droits `0600`, exigés par `ssh`) : Git ne conserve pas
ces droits, et un dossier monté depuis Windows ou macOS ne les garantit pas.
