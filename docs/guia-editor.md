# Guia de l'editor

Guia curta per a qui escriu i publica al web. No cal saber programar. Si alguna cosa no surt com s'explica aquí, avisa l'administrador.

## 1. Entrar

1. Ves a `https://el-teu-domini/admin` i entra amb el correu i la contrasenya que t'hagi donat l'administrador.
2. La contrasenya té com a mínim 12 caràcters. Pots canviar-la a **El meu compte**.
3. Si t'equivoques diverses vegades, el sistema t'atura uns minuts. Espera i torna-ho a provar.

## 2. Com funciona: esborrany i web en directe

- Tot el que escrius es guarda com a **esborrany**. **Guardar no canvia el web públic.**
- El web públic només canvia quan prems **Publica**. Fins aleshores la gent continua veient l'última versió publicada.
- Cada idioma (català, castellà, anglès) es publica per separat. Pots publicar primer en català i traduir després.
- Si alguna cosa no està traduïda, el web mostra la versió en català.
- Després de publicar, el canvi es veu al web en uns segons.

Estats: **Esborrany** (no publicat), **Programat** (es publicarà sol el dia i l'hora indicats) i **Publicat**.

## 3. Crear un article o una pàgina

1. A **Articles** (notícies) o **Pàgines**, prem **Nou article** / **Nova pàgina**.
2. A la columna lateral, omple el títol, l'adreça (*slug*), la categoria, l'autor/a i la imatge de portada.
3. El contingut es construeix amb **seccions**, una sota l'altra:
   - **Afegeix** una secció des de la llista.
   - **↑ ↓** la mouen amunt o avall. **✕** l'elimina.
   - No hi ha manera de canviar colors, tipus de lletra o posicions. El disseny és sempre el mateix, i així el web es veu coherent.
4. Prem **Desa**. Quan estigui llest, prem **Publica**. Si vols que surti més endavant, tria dia i hora i prem **Programa**.

### Tipus de secció

| Secció | Per a què serveix |
|---|---|
| Capçalera | Títol gran amb imatge de fons i fins a dos botons |
| Text | Text corregut (vegeu més avall) |
| Imatge | Una imatge amb peu de foto |
| Vídeo / Adobe | Enganxa l'enllaç d'un vídeo de YouTube o d'un document d'Adobe. No s'accepten altres llocs |
| Formulari | Mostra un dels formularis creats a **Formularis** |
| Crida a l'acció | Un missatge curt amb botó |
| Fila de destacats | Una fila de blocs destacats amb enllaç |
| Graella de targetes | Una quadrícula de targetes (imatge, títol, text, enllaç) |
| Últimes notícies | Es posa sola: mostra els últims articles |
| Llista de cookies | Es posa sola: mostra les cookies que fa servir el web |

### Format del text

Només hi ha el format bàsic, i és a propòsit:

- Un paràgraf nou se separa amb una línia en blanc.
- `**negreta**` i `*cursiva*`.
- `[text de l'enllaç](https://adreça)`.
- Una llista: cada línia comença amb `- `.

### Enllaços

- A una altra pàgina del web: escriu només el camí, per exemple `/ca/agremia-t`.
- A un altre web: l'adreça sencera, amb `https://`.

## 4. Imatges i fitxers

1. A **Fitxers**, puja la imatge o el PDF (màxim 15 MB). No s'accepten SVG.
2. El sistema la redueix i la optimitza sol. No cal preparar-la.
3. **El text alternatiu és obligatori en cada idioma.** Descriu què es veu, en una frase, per a qui no pot veure la imatge. Sense ell, no es pot publicar la pàgina.
4. Un fitxer que s'està fent servir en alguna pàgina no es pot esborrar.

## 5. Traduccions

Dins de cada article o pàgina, al panell lateral, hi ha els idiomes (CA, ES, EN). Cada idioma té el seu títol, la seva adreça, el seu contingut i el seu estat de publicació.

## 6. Formularis i contactes

- **Formularis** construeix formularis amb la mateixa idea de llista: afegeix camps, mou-los amb ↑ ↓, treu-los amb ✕. Hi pots posar condicions (mostrar un camp segons una resposta anterior), camps obligatoris i salts de pàgina.
- Cada formulari té una **destinació**: crear un contacte amb una petició, adjuntar la resposta a un projecte o client, o només recollir respostes.
- Perquè es vegi al web, posa la secció **Formulari** en una pàgina, o comparteix l'enllaç o el codi per incrustar que surt al constructor.
- **Respostes**: a cada formulari veus les respostes i les pots **exportar a CSV** (s'obre a Excel o Google Sheets).
- **Contactes** és la llista de peticions rebudes. Pots **cercar** (nom, correu, empresa) i **filtrar** per estat i responsable. Obre una petició per veure les respostes i el consentiment, canviar l'**estat** (Nou, Contactat, Qualificat, Guanyat, Perdut), assignar-hi un **responsable**, afegir **notes** internes i, si la persona esdevé client, prémer **Converteix en client**.
- Les dades personals són responsabilitat nostra: no les copiïs a llocs fora del sistema sense necessitat.
- Si una persona demana que s'esborrin les seves dades, demana-ho a un administrador: pot eliminar el contacte amb totes les seves peticions, notes, respostes, fitxers i el client creat a partir d'ell.
- Les caselles de consentiment es mostren amb el text exacte que s'ha configurat. **No canviïs aquest text sense consultar-ho amb el/la responsable legal.** La casella del butlletí mai no ve marcada.

## 7. Què només fan els administradors

- **Usuaris**: crear-ne, canviar el rol (administrador o editor), restablir contrasenyes i eliminar.
- **Configuració**: menú principal, peu de pàgina, botons de la capçalera (per exemple, *Campus virtual*), xarxes socials, dades de contacte, enllaços legals, SEO per defecte i pàgina d'inici.
- **Errors**: problemes inesperats del web (vegeu l'apartat següent).

## 8. Si alguna cosa no va bé

- **Tauler → Estat del sistema** (administradors) diu si les tasques programades funcionen, si hi ha correus pendents o fallits i quants errors oberts hi ha.
- **Un article programat no ha sortit:** mira l'estat del sistema. Si diu *Aturades*, avisa qui manté el servidor.
- **No arriben els correus d'avís dels formularis:** mira *Correus fallits* al tauler. Les respostes no es perden mai; el sistema reintenta l'enviament durant un dia.
- **Has publicat una cosa per error:** obre-la i prem **Passa a esborrany**: deixa de ser visible al web. Si vols recuperar una versió anterior, al panell lateral hi ha **Versions publicades**: prem **Restaura** i es copia a l'esborrany (no canvia el web fins que tornis a publicar). Es guarden les últimes 10.
- **El web no respon:** mira-ho des d'un altre dispositiu i avisa qui manté el servidor. Les pàgines ja visitades continuen servint-se encara que falli la base de dades.

## 9. Cercador

El web té un cercador a la capçalera (i al menú del mòbil). Només troba contingut **publicat**, en l'idioma que s'està veient, i no distingeix accents ni majúscules. Un esborrany mai no hi surt.

## 10. Consells de seguretat

- Mai no comparteixis la teva contrasenya. Cada persona té el seu usuari.
- Surt (**Surt**) si fas servir un ordinador compartit.
- No publiquis dades personals en articles o pàgines.
