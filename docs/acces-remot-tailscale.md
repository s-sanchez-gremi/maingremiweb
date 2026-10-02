# Treballar en remot amb Tailscale

La web funciona a l'**ordinador del Sam** i la resta de l'equip hi entra des de qualsevol lloc amb **Tailscale**, una xarxa privada i gratuïta entre els vostres aparells. La web no queda oberta a Internet: només hi poden entrar els aparells connectats al vostre Tailscale.

Cal que l'ordinador del Sam estigui **encès, sense entrar en repòs i amb la web en marxa**. Si s'apaga, la web deixa de funcionar fins que es torni a encendre.

## 1. Compte de Tailscale (una sola vegada)
1. Entra a <https://tailscale.com> → *Get started* i crea el compte amb el teu correu de Google o Microsoft. El pla *Personal* és gratuït.
2. Feu servir **aquest mateix compte** en tots els aparells (ordinador del Sam, el teu portàtil, el mòbil…). És la manera més senzilla.

## 2. Ordinador del Sam (on funciona la web)
1. **La web ha de funcionar en local.** Si encara no la té instal·lada, cal Docker Desktop i Node 22, i des de la carpeta del projecte s'executa `./scripts/local-setup.sh` (vegeu el README).
2. **Instal·la Tailscale** des de <https://tailscale.com/download>, obre'l i inicia sessió amb el compte del pas 1.
3. **Apunta el nom de l'ordinador.** A la icona de Tailscale (a la barra de dalt del Mac) → *This device*, surt un nom del tipus `ordinador-sam.tail1234.ts.net`. És el nom complet, amb `.ts.net` al final, el que necessites. A partir d'aquí l'anomenem **NOM**.
4. **Canvia quatre línies del fitxer `.env`** (a la carpeta del projecte). Substitueix `localhost` per NOM només en aquestes:
   ```
   SITE_URL=http://NOM:3000
   S3_PUBLIC_URL=http://NOM:9090/apex-media
   CRM_URL=http://NOM:3001
   ```
   Deixa igual `DATABASE_URL`, `S3_ENDPOINT` i `CRM_INTERNAL_URL`: segueixen amb `localhost`.
5. **Engega la web** des de la carpeta del projecte amb:
   ```
   pnpm dev
   ```
   Aquesta ordre engega la web i el CRM alhora. Deixa la finestra oberta.
6. Si el Mac pregunta si vols permetre connexions entrants a `node`, digues **Permetre**.
7. **Que no s'adormi.** Ves a *Configuració del Sistema → Bateria / Energia → Opcions* i activa *Evitar que el Mac entri en repòs automàticament quan la pantalla estigui apagada*. Si és un portàtil, deixa'l connectat al corrent. També pots obrir una altra finestra del Terminal i escriure `caffeinate -dims`: mentre estigui oberta, el Mac no s'adorm.

## 3. Els altres aparells (el teu portàtil, el mòbil…)
1. Instal·la Tailscale i inicia sessió amb el **mateix compte**.
2. Obre al navegador:
   - Web: `http://NOM:3000/ca`
   - Administració de la web: `http://NOM:3000/admin`
   - CRM: `http://NOM:3001/admin`
   - Correus de prova: `http://NOM:8025`

## Seguretat
- Fes servir contrasenyes llargues (la web n'exigeix un mínim de 12 caràcters i bloqueja els intents repetits).
- Per donar accés a una altra persona, convida-la al Tailscale (*Admin console → Users → Invite*). No li passis el compte.
- Si un aparell es perd, esborra'l a l'*Admin console → Machines*.
- Això és un entorn de treball, no la web pública. Quan la web s'hagi d'obrir al públic, va al servidor (VPS d'IONOS, vegeu `DEPLOY.md`).

## Si alguna cosa no va
- **La pàgina no carrega:** comprova que Tailscale està connectat als dos aparells, que l'ordinador del Sam està encès i que la finestra de `pnpm dev` segueix oberta.
- **La pàgina surt però els botons no responen o les imatges no es veuen:** revisa que el `.env` del pas 2.4 tingui NOM escrit exactament igual i torna a engegar `pnpm dev`.
