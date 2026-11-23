import { assert } from '@othila-academy/lab';
import { distant } from '../../shared/distant.mjs';
import { imageName, registryDigest } from '../../shared/registre.mjs';
import { run } from '../../shared/run.mjs';

export const title = 'Livrer la version 1.0.0';
export const explain = 'Une étiquette 1.0.0 et une étiquette SHA désignent la même image. À qui sert chacune ?';
export const instructions = `Un SHA désigne un commit ; une version désigne une promesse faite aux autres équipes. Ton pipeline publie aussi
l'image sous la version quand un tag Git v* est poussé :
  1. déclenche le workflow sur les tags : on: push: tags: ['v*'] (à côté de branches) ;
  2. dans le job publier, si github.ref commence par refs/tags/v, ajoute l'étiquette <image>:<version sans le v>
     (\${GITHUB_REF_NAME#v}) et passe-la en APP_VERSION ; sinon APP_VERSION peut valoir dev-<SHA court>.
Puis pose et pousse la version, sur un commit dont le pipeline est vert :
  git tag v1.0.0 && git push origin v1.0.0
Attendu : ghcr.io/<toi>/<dépôt>:1.0.0 existe. Elle servira au lab cluster (usine release 1.0.0).
Les manifests citeront toujours une version, jamais un SHA.

À expliquer (npx lab submit livraison version) : une étiquette 1.0.0 et une étiquette SHA désignent la même image. À qui sert chacune ?`;

export const checks = [
  {
    id: 'tag-v1',
    label: 'le tag Git v1.0.0 existe et désigne un commit de ta branche',
    run: async () => {
      const tag = await run('git', ['rev-parse', '--verify', '--quiet', 'v1.0.0^{commit}']);
      assert(tag.code === 0, 'Attendu : un tag v1.0.0. Constaté : absent. git tag v1.0.0, puis git push origin v1.0.0.');
      const ancestor = await run('git', ['merge-base', '--is-ancestor', 'v1.0.0', 'HEAD']);
      assert(ancestor.code === 0, 'Attendu : v1.0.0 sur un commit de ta branche courante. Constaté : il désigne un commit ailleurs. git log --oneline --decorate pour le voir.');
    }
  },
  distant({
    id: 'image-1-0-0',
    label: "l'image 1.0.0 existe dans ton registre ghcr.io",
    run: async () => {
      const digest = await registryDigest('1.0.0');
      assert(digest, `Attendu : ${await imageName()}:1.0.0. Constaté : absente. Le tag est-il poussé (git push origin v1.0.0), et le workflow déclenché sur les tags v* ?`);
    }
  })
];

export const hints = [
  'Un tag poussé déclenche-t-il ton workflow ? Regarde ce que filtre on: push: branches.',
  'on: push: tags: [\'v*\'] ; dans le job publier, un if sur github.ref (refs/tags/v…) pour ajouter l’étiquette de version.',
  'Dans l’étape meta : if [[ "$GITHUB_REF" == refs/tags/v* ]]; then version="${GITHUB_REF_NAME#v}"; tags="$tags,$image:$version"; fi ; puis git tag v1.0.0 && git push origin v1.0.0.'
];

export const points = 100;
