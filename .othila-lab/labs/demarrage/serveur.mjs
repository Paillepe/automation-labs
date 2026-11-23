import { assert } from '@othila-academy/lab';
import { requireDocker, running } from '../../shared/docker.mjs';
import { ssh } from '../../shared/ssh.mjs';
import { tail } from '../../shared/run.mjs';

export const title = 'Se connecter au serveur de test';
export const explain = "srv-test n'a ni mot de passe ni interface. Qu'est-ce qui t'autorise à t'y connecter ?";
export const instructions = `srv-test est un « serveur » du cours : un conteneur Debian avec sshd, Node.js 24 et le script de service de
l'application (/etc/init.d/reservations). Il est vide : aucune application n'y tourne.
  usine up servers
  ssh -i ~/.ssh/usine_lab deploy@srv-test
Une fois connecté : hostname, node --version, sudo service reservations status, puis exit.
Repère : la clé privée de lab est dans infra/keys/ (une clé de cours, sans valeur ailleurs) ; usine l'installe dans
~/.ssh/usine_lab avec les droits 0600 qu'exige ssh. Le serveur connaît la clé publique.

À expliquer (npx lab submit demarrage serveur) : srv-test n'a ni mot de passe ni interface. Qu'est-ce qui t'autorise à t'y connecter ?`;

export const checks = [
  {
    id: 'srv-test-ssh',
    label: 'srv-test accepte la clé de lab en SSH (utilisateur deploy)',
    passesOnStart: true,
    run: async () => {
      await requireDocker();
      assert(await running('srv-test'), 'Attendu : srv-test démarré. Constaté : absent ou arrêté. Lance usine up servers.');
      const { code, stdout, stderr } = await ssh('srv-test', 'hostname');
      assert(code === 0 && stdout.trim() === 'srv-test', `Attendu : une session SSH sur srv-test. Constaté : ${tail(stderr || stdout) || `code ${code}`}. usine up servers réinstalle la clé.`);
    }
  }
];

export const hints = [
  'Quelle commande usine démarre les serveurs du cours ? usine help les liste.',
  'usine up servers, puis ssh avec l’option -i qui désigne la clé de lab, vers l’utilisateur deploy.',
  'usine up servers ; ssh -i ~/.ssh/usine_lab deploy@srv-test ; hostname ; exit.'
];

export const points = 25;
