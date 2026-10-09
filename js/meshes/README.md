# Maillages officiels des robots

Ces fichiers contiennent les maillages 3D **officiels** de certains robots, tirés de
[MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie) (Google DeepMind)
puis convertis pour le jeu par `tools/mjcf2rk.py` : pose de repos debout, axes du jeu, centimètres,
décimation (~40-55 k triangles par robot + un niveau simplifié pour les images rémanentes)
et quantification (int16, base64). Les modèles du jeu (`js/models/*.js`) les placent sur le
squelette avec `ctx.real(...)` (voir `js/kit.js`).

| Fichier | Robot | Source | Licence |
|---|---|---|---|
| `h1.js` | Unitree H1 | `mujoco_menagerie/unitree_h1` (Unitree Robotics) | BSD-3-Clause — [`licenses/unitree_h1-BSD-3-Clause.txt`](licenses/unitree_h1-BSD-3-Clause.txt) |
| `apollo.js` | Apptronik Apollo (mécanique, mains ; les coques blanches sont remodelées aux cotes de la CAO) | `mujoco_menagerie/apptronik_apollo` (Apptronik) | Apache-2.0 — [`licenses/apptronik_apollo-Apache-2.0.txt`](licenses/apptronik_apollo-Apache-2.0.txt) |
| `cassie.js` | Agility Cassie (jambes utilisées pour Digit) | `mujoco_menagerie/agility_cassie` (Agility Robotics) | MIT — [`licenses/agility_cassie-MIT.txt`](licenses/agility_cassie-MIT.txt) |

Modifications apportées aux fichiers d'origine : conversion de format, changement d'axes et d'unité,
décimation et quantification des maillages ; les couleurs sont redéfinies dans les modèles du jeu.

Les autres robots (Optimus, Atlas, Figure 02, ASIMO, Ameca, T800, Asimov) sont modélisés à la main d'après des photos.

Régénérer (dépendances : `pip install mujoco pyfqmr numpy`) :

```sh
python3 -I tools/h1conv.py <menagerie>/unitree_h1/h1.xml js/meshes/h1.js   # budgets par pièce (CAO difficile à décimer)
python3 -I tools/apollo_conv.py <menagerie>/apptronik_apollo/apptronik_apollo.xml js/meshes/apollo.js   # enveloppe extérieure + normales transférées
python3 -I tools/mjcf2rk.py <menagerie>/agility_cassie/cassie.xml js/meshes/cassie.js --id cassie --key home --budget 24000 --low 3000 \
  --license "MIT, © 2022 Agility Robotics" --src "MuJoCo Menagerie / agility_cassie (Agility Robotics)"
```
