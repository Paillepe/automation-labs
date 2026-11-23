import { assert } from '@othila-academy/lab';
import { get, seen } from '../../shared/http.mjs';
import { requireServer, servesHead } from '../../shared/serveurs.mjs';

export const title = 'Déployer avec un rôle';
export const explain = 'Quelle tâche de ton rôle remplace quelle ligne de deploy.sh, et laquelle a disparu ?';
export const instructions = `Complète le rôle project/ansible/roles/reservations/ en suivant ses commentaires (la correspondance avec deploy.sh
est dans le résumé du lab), et écris project/ansible/site.yml : un play sur le groupe web, become: true, qui
applique le rôle reservations. La base est db, sur le réseau back (lab terraform), utilisateur et base reservations,
mot de passe : celui de var.db_password dans project/infra/variables.tf. Pour cette étape, mets-le en clair dans
project/ansible/group_vars/web/vars.yml (db_password: …) : l'étape secret le chiffrera.
  git add project/ansible && git commit -m "Déploie par Ansible"
  ansible-playbook site.yml
  curl http://srv-web-1:8080/ready ; curl http://srv-web-2:8080/version
Repère : le rôle déploie le commit courant (app_commit, dans defaults/main.yml) : commite avant de lancer.

À expliquer (npx lab submit ansible deployer) : quelle tâche de ton rôle remplace quelle ligne de deploy.sh, et laquelle a disparu ?`;

const ready = (host) => async () => {
  await requireServer(host, 'usine up infra (ou usine rebuild)');
  const r = await get(`http://${host}:8080/ready`);
  assert(r.status === 200, `Attendu : /ready de ${host} en HTTP 200. Constaté : ${seen(r)}${r.json?.reason ? ` (${r.json.reason})` : ''}. Le fichier d'environnement pointe-t-il vers db avec le bon mot de passe ?`);
};

export const checks = [
  { id: 'ready-web-1', label: 'srv-web-1 est prêt : /ready est vert (application connectée à db)', run: ready('srv-web-1') },
  { id: 'ready-web-2', label: 'srv-web-2 est prêt : /ready est vert', run: ready('srv-web-2') },
  {
    id: 'version-web',
    label: 'les deux serveurs servent le commit courant',
    run: async () => {
      for (const host of ['srv-web-1', 'srv-web-2']) {
        await requireServer(host, 'usine up infra (ou usine rebuild)');
        await servesHead(host);
      }
    }
  }
];

export const hints = [
  'Que dit ansible-playbook site.yml, tâche par tâche, et laquelle échoue en premier ? Si /ready est rouge, sa raison (reason) le dit.',
  'Le gabarit reservations.env.j2 reçoit les variables du rôle (defaults/main.yml) et de group_vars/web/ ; le handler se déclenche par notify.',
  'Tâches : shell avec creates: pour l’archive (delegate_to: localhost, run_once), apt, user, lineinfile, copy, unarchive (remote_src), template (notify), meta: flush_handlers, service started, uri avec until: ready.status == 200.'
];

export const points = 150;
