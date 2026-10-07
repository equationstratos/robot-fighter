# ROBOT FIGHTER II — The Humanoid Warriors

Jeu de combat arcade en HTML5 façon *Street Fighter II* avec de **vrais robots humanoïdes** rendus en 3D temps réel (Three.js) :
Optimus Gen 2 (Tesla), Atlas électrique (Boston Dynamics), Figure 02, ASIMO (Honda), Unitree H1,
Ameca (Engineered Arts), Digit (Agility Robotics), T800 (EngineAI, combats REK) et Apollo (Apptronik).

## Jouer

Le jeu est un site statique : il suffit de servir le dossier avec n'importe quel serveur web.

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour le publier gratuitement : *Settings → Pages → Deploy from a branch → main / (root)* (dépôt public requis sur un compte gratuit).

## Contenu

- Écran titre avec les vidéos d'intro, PRESS START, modes Arcade (1 joueur), Versus (2 joueurs) et Commandes
- Sélection des robots (ils réagissent : entrée, démonstrations de coups, explosion de validation), écran VS animé
- Combats en 2 manches gagnantes, chrono 99, garde, combos
- Coups de pied façon boxe française / MMA (fouetté, high kick, chassé frontal, retourné, genou sauté, low kick, balayage)
- Projections pour chaque robot (suplex, o-goshi, double-leg) et prises contorsionnistes d'Atlas (moteurs 360°)
- Coups spéciaux par robot et SUPER avec bandeau en gros plan
- Décors réels tirés des vidéos (labo néon, entrepôt arcade), ombres, reflets au sol, bloom, caméra cinématique
- IA progressive, clavier 2 joueurs, manette, contrôles tactiles, clic souris (poing / pied)
- Qualité graphique adaptative pour les mobiles

## Commandes (clavier)

| | Joueur 1 | Joueur 2 |
|---|---|---|
| Déplacement | W A S D | Flèches |
| Poings léger / fort | F / G | K / L |
| Pieds léger / fort | V / B | , / . |
| Spécial 1 / 2 / SUPER | R / T / Y | I / O / P |

- Projectile ↓↘→ + P · uppercut / salto →↓↘ + P/K · ruée / toupie ↓↙← + P/K · SUPER ↓↘→↓↘→ + P
- Projection : → ou ← + HP au contact · Chassé frontal : → + LK · Retourné : → + HK · Genou sauté : → + HP

## Structure

- `index.html` — page du jeu
- `js/core.js` — canvas, entrées, audio · `js/robots.js` — roster, poses, squelette · `js/fight.js` — combat, coups, prises, IA
- `js/scenes.js` — écrans, HUD, boucle · `js/render3d.js` — rendu 3D · `js/kit.js` — kit de modélisation des robots
- `js/models/<robot>.js` — un modèle 3D par robot (contrat décrit en tête de `js/kit.js`)
- `tools/viewer.html`, `tools/shoot.js` — prévisualisation / capture d'un modèle (`node tools/shoot.js atlas out.png`)
- `vendor/three-bundle.js` — Three.js r160 (licence MIT, voir `vendor/THREE-LICENSE.txt`)
