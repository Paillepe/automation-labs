// Les checks lents (ADR-0004) : sonder une condition jusqu'à un délai annoncé dans le libellé du check.
// condition renvoie une valeur vraie quand c'est bon, ou lève / renvoie faux ; le dernier constat sert au message.
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function attendre(condition, { delai = 60, pas = 2, attendu, constat = () => 'rien de nouveau' }) {
  const fin = Date.now() + delai * 1000;
  let dernier;
  for (;;) {
    try {
      const value = await condition();
      if (value) return value;
      dernier = await constat();
    } catch (error) {
      dernier = error.message;
    }
    if (Date.now() >= fin) throw new Error(`Attendu : ${attendu} sous ${delai} s. Constaté : ${dernier}`);
    await pause(pas * 1000);
  }
}
