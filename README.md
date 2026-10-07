# ROBOT FIGHTER II — The Humanoid Warriors

Jeu de combat HTML5 façon Street Fighter II avec de vrais robots humanoïdes :
Optimus (Tesla), Atlas (Boston Dynamics), Figure 02, ASIMO (Honda), Unitree H1,
Ameca (Engineered Arts), Digit (Agility Robotics), T800 (EngineAI · REK), Apollo (Apptronik).

Ouvrir `index.html` via un serveur web (ex. `python3 -m http.server`) puis jouer.

## Modes (écran titre)
- **ARCADE** (1 joueur) : tous les autres robots à la suite, IA de plus en plus forte, CONTINUE.
- **VERSUS** (2 joueurs) : clavier partagé, manettes ou tactile.
- **TOURNOI** (8 robots) : tableau à élimination directe — quarts, demi-finales, finale — avec
  les autres combats simulés, scores 2-0 / 2-1, possibilité de réessayer un match perdu et
  cérémonie du champion.
- **TRAINING** : choix de votre robot puis du mannequin ; chrono infini, vie qui se recharge,
  jauge SUPER infinie (réglable), compteur de dégâts / combo / record ; mannequin
  DEBOUT, ACCROUPI, SAUTE, GARDE (bloque tout) ou CPU qui riposte ; ÉCHAP ouvre le menu training
  (réglages, replacer les robots, liste des coups, changer de robots).
- **COMMANDES** : rappel des touches et manipulations.

## Combat
- Rendu 3D temps réel (Three.js) sur les décors des vidéos, caméra cinématique, reflets au sol.
- Coups de boxe française / MMA (fouetté, chassé, retourné, genou sauté, balayette), projections,
  prises inédites d'Atlas (TORSION 360, MOULINET 720), boules d'énergie, uppercuts, SUPER avec cinématique.
- Effets : étincelles, éclats métalliques, hit-stop, tremblement, ralenti au K.O., combos.

## Robots 3D
- Unitree H1, Apptronik Apollo et les jambes de Digit (Agility Cassie) utilisent les **maillages
  officiels** des constructeurs publiés dans MuJoCo Menagerie (voir `js/meshes/README.md` pour les
  sources et licences BSD-3 / Apache-2.0 / MIT), convertis par `tools/mjcf2rk.py`.
- Les autres robots sont modélisés à la main d'après des photos (`js/models/*.js`).
- `node tools/shoot.js <robot> sortie.png` produit une planche de prévisualisation d'un modèle.
