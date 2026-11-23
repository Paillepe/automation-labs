import { assert } from '@othila-academy/lab';
import { distant } from '../../shared/distant.mjs';
import { imageName, registryDigest } from '../../shared/registre.mjs';
import { headSha } from '../../shared/run.mjs';

export const title = "Publier l'image depuis le pipeline";
export const explain = 'Pourquoi publier depuis le pipeline, et pas depuis ton poste avec docker push ?';
export const instructions = `Ajoute à .github/workflows/ci.yml un second job, publier, qui ne tourne que si le premier a réussi
(needs: verifier) et seulement sur un push (if: github.event_name == 'push') :
  1. permissions du job : contents: read et packages: write ;
  2. actions/checkout@v7 ;
  3. le nom de l'image : ghcr.io/<propriétaire>/<dépôt>, en minuscules — dans un run:,
     echo "image=ghcr.io/\${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT" (avec un id: pour l'étape) ;
  4. docker/login-action@v4 : registry ghcr.io, username \${{ github.actor }}, password \${{ secrets.GITHUB_TOKEN }} ;
  5. docker/build-push-action@v7 : context app, push: true, étiquette <image>:\${{ github.sha }} (le SHA complet,
     sans préfixe : c'est ce que cherche usine deploy test), arguments APP_COMMIT=\${{ github.sha }} et APP_VERSION.
actionlint, commit, push, gh run watch. L'image apparaît dans l'onglet Packages de ton profil GitHub.
Si le paquet est privé, rends-le public (Package settings > Change visibility) : le cours n'a aucun secret.

À expliquer (npx lab submit livraison publier) : pourquoi publier depuis le pipeline, et pas depuis ton poste avec docker push ?`;

export const checks = [
  distant({
    id: 'image-sha-publiee',
    label: "l'image étiquetée du SHA courant existe dans ton registre ghcr.io",
    run: async () => {
      const sha = await headSha();
      const digest = await registryDigest(sha);
      assert(digest, `Attendu : ${await imageName()}:${sha.slice(0, 12)}… Constaté : absente. Ton commit est-il poussé, et le job publier a-t-il réussi (gh run list) ?`);
    }
  })
];

export const hints = [
  'De quoi un job a-t-il besoin pour écrire dans le registre de ton dépôt ? Regarde le bloc permissions.',
  'needs: verifier, permissions: packages: write, puis docker/login-action@v4 avec secrets.GITHUB_TOKEN, puis docker/build-push-action@v7 avec push: true.',
  'tags: ${{ steps.meta.outputs.image }}:${{ github.sha }} ; build-args: APP_COMMIT=${{ github.sha }} ; l’étape meta fait echo "image=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT".'
];

export const points = 125;
