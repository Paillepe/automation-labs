import { assert } from '@othila-academy/lab';
import { inspect, requireDocker } from '../../shared/docker.mjs';
import { plan } from '../../shared/terraform.mjs';
import { run } from '../../shared/run.mjs';

const networksOf = (info) => Object.keys(info?.NetworkSettings?.Networks ?? {}).sort();
async function container(name) {
  await requireDocker();
  const info = await inspect(name);
  assert(info?.State?.Running, `Attendu : un conteneur ${name} démarré. Constaté : ${info ? info.State.Status : 'absent'}. terraform apply dans project/infra/.`);
  return info;
}

export const title = 'Décrire les serveurs et la base';
export const explain = "Après apply, pourquoi un second terraform plan n'annonce-t-il rien à faire ?";
export const instructions = `Décris dans project/infra/ (un fichier par sujet, par exemple reseaux.tf et serveurs.tf) :
  - deux réseaux Docker, front et back (resource "docker_network") ;
  - deux serveurs web, srv-web-1 et srv-web-2, sur l'image serveur (docker_image.server.image_id), reliés aux deux
    réseaux (un bloc networks_advanced par réseau) ; une seule ressource docker_container "web" avec count = 2 ;
  - la base db (resource "docker_container" "db"), sur l'image postgres, reliée à back seulement, avec les variables
    POSTGRES_DB=reservations, POSTGRES_USER=reservations, POSTGRES_PASSWORD=\${var.db_password}. Aucun bloc ports.
Puis décommente outputs.tf, et :
  terraform plan        lis-le : 7 ressources à créer
  terraform apply
  terraform plan -detailed-exitcode ; echo $?     0 : la réalité correspond au code
Rattache le devcontainer au réseau front pour joindre les serveurs par leur nom : usine up infra le fait (il joue
aussi terraform apply). Commite project/infra/ (jamais le state : il est ignoré).

À expliquer (npx lab submit terraform serveurs) : après apply, pourquoi un second terraform plan n'annonce-t-il rien à faire ?`;

export const checks = [
  {
    id: 'reseaux',
    label: 'les réseaux front et back existent',
    run: async () => {
      await requireDocker();
      for (const name of ['front', 'back']) {
        const { code } = await run('docker', ['network', 'inspect', name]);
        assert(code === 0, `Attendu : un réseau Docker ${name}. Constaté : absent. docker network ls.`);
      }
    }
  },
  {
    id: 'serveurs-web',
    label: 'srv-web-1 et srv-web-2 tournent, reliés à front et à back',
    run: async () => {
      for (const name of ['srv-web-1', 'srv-web-2']) {
        const nets = networksOf(await container(name));
        assert(nets.includes('front') && nets.includes('back'), `Attendu : ${name} sur front et back. Constaté : ${nets.join(', ') || 'aucun réseau'}.`);
      }
    }
  },
  {
    id: 'base-sur-back',
    label: 'db tourne, reliée au seul réseau back',
    run: async () => {
      const nets = networksOf(await container('db'));
      assert(nets.length === 1 && nets[0] === 'back', `Attendu : db sur back seulement. Constaté : ${nets.join(', ') || 'aucun réseau'}.`);
    }
  },
  {
    id: 'plan-sans-ecart',
    label: "terraform plan n'annonce aucun changement : l'infrastructure réelle correspond au code",
    run: async () => {
      const result = await plan();
      assert(result.code !== 1, `Attendu : un plan sans erreur. Constaté : ${result.summary}`);
      assert(result.code === 0, `Attendu : rien à faire (code 0). Constaté : ${result.summary}. As-tu lancé terraform apply après ta dernière modification ?`);
    }
  }
];

export const hints = [
  'Combien de ressources dois-tu déclarer, de quels types ? Le provider docker a docker_network et docker_container.',
  'Un docker_container "web" avec count = 2, name = "srv-web-${count.index + 1}", deux blocs networks_advanced ; un docker_container "db" avec un seul bloc networks_advanced.',
  'resource "docker_network" "front" { name = "front" } (idem back) ; dans web : image = docker_image.server.image_id, networks_advanced { name = docker_network.front.name } et le même pour back ; dans db : env = ["POSTGRES_PASSWORD=${var.db_password}", …].'
];

export const points = 150;
