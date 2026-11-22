#!/usr/bin/env bash
# Assemble, dans un dossier à part, le dépôt de test jetable du spike GitHub (SPEC §3.2) : le devcontainer,
# usine, le spike local, et deux workflows (publication sur GHCR ; même scénario via devcontainers/ci).
# Ne crée rien sur GitHub et ne pousse rien : la suite est dans LISEZMOI.md.
#   tests/spike/github/preparer.sh <dossier-de-destination>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
dest="${1:?usage : preparer.sh <dossier-de-destination>}"
[[ ! -e "$dest" ]] || { echo "erreur : $dest existe déjà" >&2; exit 1; }
mkdir -p "$dest/.github/workflows"
git -C "$ROOT" archive HEAD .devcontainer scripts infra tests package.json package-lock.json .gitattributes .gitignore .shellcheckrc \
  | tar -x -C "$dest"
cp "$ROOT/tests/spike/github/workflows/"*.yml "$dest/.github/workflows/"
cp -R "$ROOT/tests/spike/github/hello" "$dest/hello"
git -C "$dest" init -q -b main
git -C "$dest" add -A
git -C "$dest" -c commit.gpgsign=false commit -qm "Spike d'environnement"
echo "Dépôt de test prêt dans $dest (rien n'est poussé)."
