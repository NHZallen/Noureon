// The update notes in French (see translations.js): `{ "<version>": [the strings of the note in src/data/update-logs/entries.js, translated] }`.
// Every version that has notes is here, with the same number of strings and the same HTML tags in the same order as the original (tests/update-logs-translations.test.js).
export default {
  "18.5.0": [
    "<strong>Notes de version de Noureon 18.5.0</strong>",
    "Cette version confirme que Notion n’a qu’une seule sorte de connexion : le connecteur hébergé par Notion (accès complet).",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Une seule sorte de connexion Notion :</strong> une connexion propre à Noureon pour Notion (qui ne partageait que les pages choisies) a été essayée puis retirée ; dans la page des extensions, Notion reste « Accès complet (MCP) » comme avant.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.4.2": [
    "<strong>Notes de version de Noureon 18.4.2</strong>",
    "Cette version corrige la liste des connecteurs qui n’apparaissait pas tout de suite après une connexion.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Retour d’une connexion :</strong> après s’être connecté sur un service et être revenu dans Noureon, « Mes connecteurs » était vide et la connexion n’apparaissait qu’après avoir changé de page. Quand la page est ouverte par son adresse, l’état du compte n’est connu que un peu plus tard, et la liste avait été dessinée vide avant et n’était plus redessinée. Elle est maintenant redessinée dès que le compte est connu.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.4.1": [
    "<strong>Notes de version de Noureon 18.4.1</strong>",
    "Cette version corrige des problèmes découverts à la première utilisation réelle des connecteurs, et modifie la liste et les autorisations des connecteurs.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Où sont les questions :</strong> la carte de confirmation d’un connecteur, et les questions d’un outil en ligne de commande sur un site et sur une connexion, étaient dans les étapes repliées, et on ne savait pas qu’il fallait les ouvrir. Elles apparaissent maintenant dans la discussion, juste sous la ligne des étapes.</li><li><strong>La fenêtre de connexion :</strong> après être allé se connecter sur un service puis avoir appuyé sur le bouton Retour du navigateur, la fenêtre restait sur « Redirection… » avec des boutons inutilisables et sans moyen d’annuler. Au retour, le bouton est maintenant rétabli et « Annuler » n’est jamais désactivé.</li><li><strong>Le nom et l’icône dans Notion :</strong> pour un client qu’il ne connaît que par un fichier de connexion, la page d’autorisation de Notion n’affiche que l’adresse de redirection (api.noureon.com). Notion fait maintenant connaissance avec Noureon d’abord par enregistrement (avec le nom, l’icône et l’adresse des conditions), et le fichier de connexion n’est utilisé que si l’enregistrement est refusé.</li><li><strong>Ouverture dans la liste :</strong> choisir un connecteur dans la liste l’ouvre sur place, avec quelques mots sur ce qu’il sait faire et des demandes à essayer, au lieu de passer à « Mes connecteurs » ; un connecteur pas encore connecté s’ouvre de la même façon, et le bouton Connecter à droite lance la connexion.</li><li><strong>Autorisations :</strong> les autorisations de chaque connexion dans « Mes connecteurs » se replient et se déplient, et l’onglet Autorisations des réglages a une nouvelle page Connecteurs où l’on règle aussi chaque outil.</li><li><strong>Icônes :</strong> la liste, la carte de confirmation et les réglages des connecteurs utilisent le logo de chaque projet (pris sur GitHub ; la première lettre du nom s’affiche si l’image ne peut pas être chargée).</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Une connexion Notion existante doit être déconnectée puis reconnectée pour utiliser le nouvel enregistrement.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.4.0": [
    "<strong>Notes de version de Noureon 18.4.0</strong>",
    "Cette version ajoute les connecteurs : la troisième partie des extensions, qui permet au modèle d’accéder à vos propres comptes sur d’autres services.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Connecteurs :</strong> connectez Notion et Linear dans Extensions → Connecteurs. Vous vous connectez sur la page du service lui-même avec OAuth (avec PKCE), et Noureon ne voit jamais votre mot de passe ; le jeton d’accès et le jeton de renouvellement sont conservés chiffrés en AES-256-GCM sur le serveur et ne sont donnés ni au navigateur ni au modèle. Toute la page va vers le service pour la connexion et revient à l’application ensuite, sans fenêtre contextuelle, ce qui fonctionne aussi sur téléphone.</li><li><strong>Réglage des outils :</strong> chaque outil peut être réglé sur autoriser, demander à chaque fois ou refuser : les outils de lecture sont autorisés au départ et les outils d’écriture demandent à chaque fois, puis c’est à vous de décider, sans autre limite. Linear propose une connexion en lecture seule, dont le jeton ne peut pas écrire du tout ; la connexion à Notion ne distingue pas lecture et écriture, seuls les réglages des outils s’appliquent. Quand les outils d’un service changent, les outils nouveaux ou modifiés sont désactivés jusqu’à votre confirmation.</li><li><strong>La carte de confirmation :</strong> quand le modèle appelle un outil réglé sur demander, une carte apparaît dans les étapes avec le connecteur, l’outil et tous les paramètres, et vous pouvez autoriser une fois, toujours autoriser ou refuser ; sans réponse en 10 minutes, c’est un refus.</li><li><strong>Sécurité :</strong> ce qu’un service renvoie est toujours traité comme une donnée et ne peut pas changer ce que vous avez autorisé ; une réponse fait au plus 30 appels à des services, et un résultat de plus de 30 000 caractères est coupé. Les connecteurs ne servent que dans les réponses faites par le serveur, pas dans les discussions temporaires. À la déconnexion, le jeton est révoqué auprès du service quand il le permet et ce qui est conservé est supprimé.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Les nouvelles tables (user_mcp_connections et mcp_oauth_clients) doivent d’abord être appliquées à la base de données côté serveur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ajoute des tables et ne modifie pas les données existantes."
  ],
  "18.3.6": [
    "<strong>Notes de version de Noureon 18.3.6</strong>",
    "Cette version réduit de combien une étape peut dépasser la limite d’écriture dans le bac à sable.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Fréquence de vérification :</strong> la croissance du dossier de sortie du bac à sable n’était vérifiée qu’une fois par seconde, si bien qu’une étape qui écrivait très vite pouvait finir entre deux vérifications et dépasser largement la limite. Elle est désormais vérifiée toutes les 250 millisecondes par défaut (modifiable avec la variable d’environnement SANDBOX_DISK_CHECK_MS), ce qui réduit le dépassement à environ un quart. La limite reste une mesure prise au moment d’une vérification ; un écrivain très rapide peut donc encore la dépasser légèrement.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Ce changement ne prend effet qu’une fois le runner de l’hôte du bac à sable mis à jour.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.3.5": [
    "<strong>Notes de version de Noureon 18.3.5</strong>",
    "Cette version corrige un démarrage qui pouvait échouer juste après la fin d’un conteneur du bac à sable.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Nouveau démarrage :</strong> lorsqu’une étape terminait son conteneur à cause de la limite d’écriture, de mémoire ou de temps, l’étape suivante démarrait un nouveau conteneur du même nom ; tant que l’ancien n’était pas entièrement supprimé, Docker refusait le démarrage car le nom était pris (code de sortie 125). Désormais, ce qui reste d’un conteneur de ce nom est supprimé avant un démarrage, et lorsque Docker refuse un démarrage avec le code 125, il est retenté un peu plus tard, trois fois au plus.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Ce changement ne prend effet qu’une fois le runner de l’hôte du bac à sable mis à jour.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.3.4": [
    "<strong>Notes de version de Noureon 18.3.4</strong>",
    "Cette version limite la quantité qu’une étape du bac à sable peut écrire, et empêche le message d’un échec de démarrage de révéler des informations sur l’hôte.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Limite d’écriture :</strong> le dossier de sortie du bac à sable se trouve sur le disque de l’hôte, et ses limites de taille ne décidaient que du nombre de fichiers renvoyés, pas de la quantité qu’une étape pouvait écrire ; une étape hors de contrôle pouvait donc remplir le disque de l’hôte. Désormais, si le dossier de sortie grandit de plus de 1 Gio pendant l’exécution d’une étape, celle-ci est arrêtée aussitôt et les fichiers qu’elle a écrits sont supprimés ; les fichiers des étapes précédentes de la même réponse ne sont pas touchés. Le message « Le code a écrit plus de fichiers qu’une étape n’y est autorisée. » est signalé, avec l’indication que l’environnement a redémarré. Un fichier creux est compté pour l’espace disque qu’il occupe réellement.</li><li><strong>Message d’un échec de démarrage :</strong> lorsqu’un conteneur du bac à sable ne peut pas démarrer, la réponse indique seulement que le démarrage a échoué et le code de sortie ; la sortie d’origine de Docker (qui peut contenir des chemins de l’hôte et des noms d’images) n’est écrite que dans le journal du runner.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Ces changements ne prennent effet qu’une fois le runner de l’hôte du bac à sable mis à jour.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.3.3": [
    "<strong>Notes de version de Noureon 18.3.3</strong>",
    "Cette version corrige la manière dont le bac à sable signale un dépassement de la limite de mémoire.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Limite de mémoire dépassée :</strong> depuis que la version 18.3.2 sépare les étapes Python et les commandes en deux processus, une étape qui utilisait trop de mémoire ne terminait que le processus de travail, signalé comme un simple « le processus Python s’est terminé » sans indiquer que l’environnement avait redémarré. Il est désormais signalé comme « le code a utilisé plus de mémoire qu’une étape n’y est autorisée », et il est indiqué que les variables précédentes ont disparu, comme auparavant. Ce changement ne prend effet qu’une fois le runner de l’hôte du bac à sable mis à jour.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.3.2": [
    "<strong>Notes de version de Noureon 18.3.2</strong>",
    "Cette version corrige plusieurs problèmes de sécurité : l’affichage des résultats de recherche, l’affichage des formules qui ne peuvent pas être rendues, la vérification du mot de passe lors de l’import d’anciennes données locales, un événement de la synchronisation des paramètres cloud, le code d’appairage du partage de poste à poste et la séparation des processus dans le bac à sable du mode avancé.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Résultats de recherche :</strong> lors d’une recherche dans les conversations, le titre et le texte des messages affichés dans les résultats étaient présentés comme du contenu web sans être échappés ; un balisage web présent dans ces textes (par exemple dans une conversation importée ou dans un texte produit par un modèle) pouvait donc être exécuté comme du code. Les titres, les extraits de texte et les messages d’erreur sont désormais toujours affichés en texte brut, et la mise en évidence des mots recherchés reste inchangée.</li><li><strong>Affichage des formules mathématiques :</strong> lorsqu’une formule ne pouvait pas être rendue, le message d’erreur reprenait telle quelle la formule écrite par le modèle, ajoutée à la page après le nettoyage ; un balisage web qu’elle contenait pouvait donc être exécuté. Le texte d’une formule est désormais toujours affiché en texte brut.</li><li><strong>Import des anciennes données locales :</strong> après la connexion à un compte cloud et le choix d’importer les anciennes données locales, l’espace de travail de l’ancien compte local de cet appareil est remplacé lorsque l’étape est confirmée. Le nom de l’ancien compte et le mot de passe saisis n’étaient pas vérifiés ; désormais, le nom de cet ancien compte et son mot de passe correct sont requis avant de continuer, sinon « Le nom du compte ancien ou le mot de passe n’est pas correct. » s’affiche et les anciennes données ne sont pas modifiées.</li><li><strong>Synchronisation des paramètres cloud :</strong> après la fusion des listes d’outils en ligne de commande et de compétences, la page reçoit un événement de notification, et tous ses champs étaient écrits dans les paramètres. Seuls les listes d’outils et de compétences et leurs champs d’horodatage sont désormais acceptés ; tout autre champ (par exemple les clés des modèles) est ignoré.</li><li><strong>Partage de poste à poste :</strong> le code d’appairage d’un partage était tiré avec la fonction aléatoire ordinaire ; il l’est désormais avec les nombres aléatoires cryptographiques du navigateur, qui ne peuvent pas être devinés, et le code passe de 5 à 8 caractères (le champ de saisie, le QR code et les textes sont mis à jour en conséquence). L’appareil qui envoie et celui qui reçoit doivent tous deux être mis à jour vers cette version pour se connecter.</li><li><strong>Bac à sable du mode avancé et des outils en ligne de commande :</strong> dans le bac à sable, un même processus Python exécutait à la fois le code écrit par un modèle et les commandes des outils, de sorte que ce code pouvait modifier l’environnement et les fonctions avec lesquels les commandes étaient lancées, faire écrire ailleurs le fichier d’identifiants d’une commande par un lien placé à l’avance, ou lire une commande pendant son exécution. Le bac à sable comporte désormais deux processus : un superviseur détient le canal vers le runner, les commandes des outils et leurs identifiants, et un processus de travail n’exécute que les étapes Python, dont la sortie et le résultat sont vérifiés avant d’être transmis ; le fichier d’identifiants n’est plus écrit à travers des liens, et seulement comme fichier ordinaire ; pendant qu’une commande avec identifiants s’exécute, les autres processus sont suspendus et reprennent une fois la commande terminée et le fichier d’identifiants supprimé. Si une étape met fin au processus Python, elle signale une erreur et les étapes suivantes utilisent un nouveau processus (les variables précédentes sont perdues). Ce changement De plus, une commande avec identifiants n’a plus /opt/pip (où les étapes peuvent écrire et exécuter des programmes) dans son PATH ni son PYTHONPATH, et Python ne lit plus le dossier site de l’utilisateur, de sorte qu’un programme placé à l’avance n’est pas exécuté par une commande de confiance. Ce changement ne prend effet qu’une fois le runner de l’hôte du bac à sable mis à jour.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.3.1": [
    "<strong>Notes de version de Noureon 18.3.1</strong>",
    "Cette version refond l’écran d’attente de la génération d’image, avec une animation de points plus fine.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Animation de points :</strong> les points sont désormais dessinés directement sur la page, sans fond de carte ni bordure. Ils sont plus petits et plus espacés, et leur taille et leur intensité suivent de doux nuages qui dérivent lentement sur la grille, laissant certaines zones presque vides. La grille couvre la zone que l’image terminée occupera, et la couleur reste la couleur d’accentuation sélectionnée.</li><li><strong>Légendes d’étape :</strong> le texte passe au-dessus des points et disparaît avec eux lorsque l’image est prête.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.3.0": [
    "<strong>Notes de version de Noureon 18.3.0</strong>",
    "Cette version améliore l’écran d’attente pendant la génération d’une image : une animation de points avec des légendes d’étape.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Animation de points :</strong> le bloc d’attente affiche un motif de nuage en mouvement formé de points. Les points reprennent la couleur d’accentuation sélectionnée et restent lisibles en mode clair comme en mode sombre. Lorsque le système est réglé pour réduire les animations, un seul motif fixe est affiché.</li><li><strong>Légendes d’étape :</strong> le texte en haut à gauche du bloc change selon le temps d’attente : « Création de l’image », « Composition de l’image », « Affinage des détails », puis, après environ 40 secondes, « Toujours en cours. Les images en haute qualité demandent plus de temps ». Les légendes suivent le temps et n’indiquent pas l’avancement réel ; aucun pourcentage n’est donc affiché.</li><li><strong>Réouverture de la page :</strong> lorsque la page est fermée puis rouverte alors qu’une image est encore en cours de génération sur le serveur, l’attente est comptée depuis l’heure de début réelle ; les légendes ne repartent donc pas du début.</li><li><strong>Transition à la fin :</strong> lorsque l’image est prête, les points disparaissent progressivement pour laisser place à l’image.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "18.2.0": [
    "<strong>Notes de version de Noureon 18.2.0</strong>",
    "Le Centre d’aide, les Conditions d’utilisation et la Politique de confidentialité sont entièrement réécrits, avec des sections et un sommaire, et couvrent toutes les fonctions et tous les flux de données actuels.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Centre d’aide :</strong>une nouvelle page, noureon.com/help, de 18 sections, des premiers pas au dépannage ; le « Centre d’aide » des réglages et le pied de page de l’accueil y renvoient.</li><li><strong>Conditions d’utilisation :</strong>16 sections sur ce qu’est le service, la responsabilité des comptes et des données, les limites des réponses de l’IA, les fournisseurs et les coûts, l’exécution sur le serveur et ses limites, les compétences et outils en ligne de commande, les comportements interdits, l’exclusion de garantie et la limitation de responsabilité, et plus.</li><li><strong>Politique de confidentialité :</strong>20 sections expliquant ce qui est conservé dans le navigateur et dans le cloud, ce qui est envoyé aux fournisseurs, l’exécution sur le serveur et la durée de conservation des clés, le flux de données de chaque fonction, la mémoire, la voix, le transfert d’appareil à appareil, les services tiers et les durées de conservation.</li><li><strong>Aussi :</strong>les trois documents existent en cinq langues ; PRIVACY.md sur GitHub est désormais généré à partir de la version anglaise.</li></ul>"
  ],
  "18.1.0": [
    "<strong>Notes de version de Noureon 18.1.0</strong>",
    "La page affichée avant la connexion est refaite : faites défiler pour voir, sur de vrais écrans, comment fonctionnent le Conseil des modèles, la recherche approfondie et les fichiers, puis les extensions, les caractéristiques, l'exécution sur le serveur, la confidentialité et la connexion.",
    "<strong>Principaux changements</strong>",
    "<ul><li><strong>Nouvelle page d'accueil :</strong>trois présentations qui défilent, faites de captures des composants de Noureon, un jeu pour le thème clair et le thème sombre dans chacune des cinq langues ; le pied de page contient les mises à jour, GitHub, le compte X officiel @NoureonAi, les conditions d'utilisation et la politique de confidentialité.</li><li><strong>Texte d'aperçu des liens :</strong>le titre et la description affichés lorsque noureon.com est partagé sont réécrits.</li><li><strong>Nettoyage :</strong>suppression des conversations d'exemple et du code de l'ancienne page d'accueil, qui ne servaient plus.</li></ul>"
  ],
  "18.0.0": [
    "<strong>Notes de version de Noureon 18.0.0</strong>",
    "Cette version ajoute les compétences : une fois une compétence ajoutée dans la page Extensions, le modèle suit ses instructions. Il y a 11 compétences officielles ; vous pouvez aussi coller la vôtre ou importer un zip, et demander au modèle de vous aider à en créer une. C’est la première version majeure depuis que la boutique d’outils en ligne de commande est devenue la page Extensions.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Page Extensions :</strong>la boutique d’outils en ligne de commande s’appelle désormais Extensions et comprend deux parties, Compétences et Outils en ligne de commande ; ses adresses sont raccourcies en /skill et /cli.</li><li><strong>Compétences :</strong>une compétence est un fichier SKILL.md (nom, description, texte). Les compétences que vous collez sont conservées dans votre propre compte cloud, que vous seul pouvez lire et modifier, jusqu’à 50 ; les listes de compétences ajoutées sont fusionnées entre appareils élément par élément.</li><li><strong>Utiliser une compétence :</strong>tapez / dans la zone de message et choisissez une compétence, et cette réponse la suit ; le modèle peut aussi décider seul : il voit le nom et une ligne pour chaque compétence que vous autorisez, et ne charge le texte complet que s’il en a besoin (vous pouvez désactiver « autoriser le modèle à l’utiliser seul » pour chaque compétence, et 5 au plus sont chargées dans une réponse). Les réponses normales, avec recherche et en mode avancé sont toutes prises en charge, sur cet appareil et sur le serveur.</li><li><strong>Compétences avec fichiers :</strong>vous pouvez importer un zip (SKILL.md avec références, scripts et ressources ; 5 Mo et 60 fichiers au plus), vérifié dans le navigateur puis sur le serveur, qui refuse les programmes, les installateurs, les liens et les chemins dangereux. Le modèle peut lire les fichiers texte d’une compétence ; les scripts Python et shell ne s’exécutent que dans le bac à sable du serveur, le dossier de la compétence étant monté en lecture seule dans /skills. Les compétences avec scripts ne sont pas proposées dans une conversation temporaire.</li><li><strong>Créer des compétences :</strong>la compétence officielle « Créer une compétence » cherche à quoi elle sert, rédige un brouillon, l’essaie et l’améliore, puis place une carte de brouillon dans la conversation ; son bouton ouvre une fenêtre où vous lisez tout (chaque fichier d’un brouillon avec fichiers peut être lu) et vous appuyez sur Ajouter pour l’enregistrer. Le modèle ne peut pas enregistrer une compétence lui-même.</li><li><strong>11 compétences officielles :</strong>Créer une compétence, Compte rendu de réunion, Relecture, Vérification des faits, Plan de présentation, Rédaction d’e-mails, Dossier de recherche, Comparaison de sources, Explication de concepts, Questions sur un document et Résumé. Aucune n’est ajoutée par défaut : appuyez sur + dans la page Extensions ; chacune a son nom et sa description en cinq langues, et répond dans la langue que vous utilisez.</li><li><strong>Confidentialité :</strong>le texte complet d’une compétence est envoyé avec le message qui l’utilise au fournisseur d’IA que vous avez choisi (et via le serveur lorsque c’est lui qui fait la réponse) ; une compétence non utilisée n’est pas envoyée. Réglages → Confidentialité et PRIVACY.md l’expliquent.</li><li><strong>Nettoyage :</strong>un zip vers lequel plus aucune compétence ne pointe (compte supprimé, enregistrement inachevé) est traité par le nettoyage quotidien du serveur, qui se contente de signaler tant qu’il n’est pas passé en mode suppression ; rien n’est supprimé avant.</li><li><strong>Autres changements :</strong>le curseur de profondeur de réflexion est une piste dans un cadre avec un bouton cerclé de la couleur d’accent ; sur iPhone, quand le clavier est affiché, l’application s’arrête là où s’arrête la zone visible, un doigt ne fait plus glisser toute la page et la liste @ s’adapte à la zone visible ; un thème de couleur venu d’un autre appareil s’affiche immédiatement.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ajoute la table user_skills, le bucket user-skill-bundles et une fonction de nettoyage (déjà appliqués au projet en production). Pour que le modèle charge des compétences, lise leurs fichiers et exécute des scripts sur le serveur, le serveur et l’hôte du bac à sable doivent être mis à jour vers cette version."
  ],
  "17.17.0": [
    "<strong>Notes de version de Noureon 17.17.0</strong>",
    "Cette version donne à chaque couleur d’accent ses propres couleurs de bulle de message et ajoute le blanc aux couleurs d’accent du thème sombre.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Couleurs de bulle :</strong> dans le thème clair, la bulle est une teinte pâle de la couleur avec un texte foncé ; dans le thème sombre, une nuance profonde avec un texte clair ; chacune des dix couleurs d’accent a sa propre paire, au lieu d’un simple éclaircissement de l’accent.</li><li><strong>Couleurs personnalisées :</strong> pour une couleur que vous choisissez vous-même, la bulle est calculée entre les deux couleurs prédéfinies voisines avec les mêmes proportions (clarté, profondeur, teinte) ; une couleur grise donne une bulle grise.</li><li><strong>Noir et blanc :</strong> les couleurs d’accent du thème clair comprennent le noir ; dans le thème sombre, ce même choix devient le blanc (le nom et le point changent aussi, même menu ouvert).</li><li><strong>Suivre le système :</strong> avec l’apparence réglée sur le système, lorsque l’appareil passe du clair au sombre, l’accent et les couleurs de bulle changent aussitôt, sans rechargement.</li><li><strong>Curseur de profondeur de réflexion :</strong> le curseur est désormais une piste dans un cadre : la partie remplie a la couleur d’accent, et le bouton est un disque sombre (clair dans le thème sombre) entouré d’un anneau d’accent, entièrement contenu dans le cadre ; le bouton de profondeur de réflexion de la zone de saisie garde la largeur de son nom le plus long, et son nom suit le curseur pendant le glissement, si bien que le panneau au-dessus ne saute plus latéralement quand le niveau change.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.16.0": [
    "<strong>Notes de version de Noureon 17.16.0</strong>",
    "Cette version ajoute un modèle de jugement : à l’envoi d’un message, le petit modèle Decisions d’OpenRouter juge s’il faut une recherche web, un fichier, un graphique ou un outil de commande, au lieu de deviner à partir des seuls mots-clés.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Quatre questions à la fois :</strong> avec une clé OpenRouter, chaque message fait un seul appel qui pose quatre questions au modèle de jugement (faut-il des informations récentes, un fichier, un graphique, un outil de commande) ; une probabilité de 60 % ou plus vaut oui.</li><li><strong>Outils de commande, prudemment :</strong> seuls les outils que vous laissez le modèle utiliser seul sont concernés (proposés ou non à ce tour) ; les outils choisis avec @ sont toujours donnés.</li><li><strong>En cas d’échec, l’ancienne méthode :</strong> sans clé OpenRouter, avec un appel échoué ou plus lent qu’une seconde, les listes de mots-clés décident comme avant et rien n’est affiché ; après deux échecs de suite, l’application attend 10 minutes avant de réessayer. Les conversations d’images n’envoient rien.</li><li><strong>Confidentialité :</strong> le texte du message (avec de courts extraits des deux messages précédents, l’indication d’un fichier joint et les noms des outils de commande que vous laissez le modèle utiliser seul) est envoyé à OpenRouter et Noureon n’en conserve rien ; Paramètres → Confidentialité et PRIVACY.md le disent.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.15.4": [
    "<strong>Notes de version de Noureon 17.15.4</strong>",
    "Cette version supprime le fondu de la liste de la barre latérale sous la ligne de recherche et fait que le fondu au-dessus de la ligne du compte ne laisse plus de ligne de coupe.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Sous la ligne de recherche :</strong> le fondu est supprimé ; la liste défile simplement sous la ligne de recherche, et l'espace entre la ligne de recherche et la liste est redevenu celui d'avant.</li><li><strong>Au-dessus de la ligne du compte :</strong> la partie du fondu la plus proche du bord est maintenant entièrement opaque : le texte collé à la ligne du compte est entièrement recouvert puis apparaît progressivement, au lieu de laisser une ligne de coupe faite de demi-lettres pâles ; au repos, il ne recouvre aucun texte de la dernière ligne.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.15.3": [
    "<strong>Notes de version de Noureon 17.15.3</strong>",
    "Cette version corrige la position du fondu de la barre latérale de la 17.15.2 : le fondu s'arrêtait à une certaine distance du bord, si bien qu'une partie de la liste sous la ligne de recherche restait découverte.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Fondu de la barre latérale :</strong> la position des bandes fixées aux bords de la liste se mesure depuis l'intérieur de la marge intérieure de la liste ; dans la 17.15.2 elles se fixaient donc 16 pixels sous le bord, et le texte sous la ligne de recherche n'était pas du tout estompé sur cette distance et paraissait coupé. Les bandes sont maintenant exactement aux bords haut et bas de la liste ; une mesure au pixel confirme que le texte au bord est entièrement recouvert et apparaît progressivement.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.15.2": [
    "<strong>Notes de version de Noureon 17.15.2</strong>",
    "Cette version corrige de nouveau la coupure de la liste de la barre latérale sous la ligne de recherche.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Fondu de la barre latérale :</strong> le fondu était une bande posée sur la liste depuis l'extérieur, et sur iPhone la liste qui défile était dessinée au-dessus, si bien que la liste était coupée net sous la ligne de recherche. Le fondu est maintenant une bande à l'intérieur de la liste, fixée à ses bords haut et bas (comme dans la conversation), et il recouvre aussi le texte sur iPhone.</li><li><strong>Fond de la barre latérale :</strong> la barre latérale est opaque, dans la couleur qu'elle avait quand elle était translucide ; sur téléphone, la conversation et la zone de saisie ne se voient plus à travers, et les fondus de ses bords correspondent exactement à sa couleur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.15.1": [
    "<strong>Notes de version de Noureon 17.15.1</strong>",
    "Cette version corrige l'aspect du champ du code de partage P2P sur téléphone, le fondu en haut et en bas de la barre latérale, et augmente le contraste du texte d'indication du thème sombre.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Champ du code de partage P2P :</strong> sur iPhone, le champ où l'on saisit le code à 5 caractères, pour recevoir des dossiers et pour recevoir des Nouras, était dessiné avec l'ombre intérieure et le cadre de focus du système et paraissait cassé ; il a maintenant le même style que les autres champs.</li><li><strong>Fondu de la barre latérale :</strong> le fondu de la liste sous la ligne de recherche et au-dessus de la ligne du compte est un dégradé plus long et progressif, de sorte que la première ligne de texte n'est plus coupée en deux ; le panneau de droite est ajusté de la même façon.</li><li><strong>Texte d'indication du thème sombre :</strong> le texte secondaire et le texte d'indication du thème sombre (indication du champ de saisie, heures, etc.) sont plus clairs, ce qui fait passer leur contraste sur la couleur d'une boîte de dialogue de 2,9 à 4,3.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.15.0": [
    "<strong>Notes de version de Noureon 17.15.0</strong>",
    "Cette version renomme « Couleur du bouton principal » en « Couleur d'accent » dans les paramètres, remplace ses choix par dix nouvelles couleurs et fait suivre l'accent au fond de la bulle des messages de l'utilisateur.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Couleur d'accent :</strong> « Couleur du bouton principal » dans Paramètres → Personnalisation → Apparence devient « Couleur d'accent », avec Bleu (par défaut), Cyan, Vert, Citron vert, Jaune, Orange, Rose, Magenta, Violet, Noir et un code couleur personnalisé. Toute l'interface n'a que cet accent : le bouton d'envoi, les interrupteurs, les cadres sélectionnés et le fond des bulles le suivent.</li><li><strong>Bulle de message :</strong> le réglage « Couleur de bulle de l'utilisateur » est supprimé ; le fond de la bulle est une teinte pâle de l'accent, d'une intensité adaptée au thème clair et au thème sombre.</li><li><strong>Thème sombre :</strong> un accent difficile à voir sur le thème sombre est éclairci automatiquement ; le noir s'affiche en gris clair sur le thème sombre, comme le bouton principal noir et blanc.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>La couleur choisie pour le fond de la bulle ne s'applique plus ; un accent choisi auparavant parmi vert, jaune, rose, orange ou violet s'affiche comme « Personnalisée » avec le même code couleur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données ; le champ userBubbleColor des paramètres est ignoré à la lecture."
  ],
  "17.14.1": [
    "<strong>Notes de version de Noureon 17.14.1</strong>",
    "Cette version corrige trois problèmes d'affichage signalés après le mode sombre de la 17.14.0 et renomme le réglage en « Apparence ».",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Paramètres sur téléphone :</strong> en mode sombre, toute la page des paramètres était translucide et laissait voir la barre latérale derrière ; elle a maintenant un fond opaque.</li><li><strong>Fondu de la barre latérale :</strong> le fondu en haut et en bas de la barre latérale ne correspondait pas à sa couleur, ce qui faisait apparaître une bande plus claire en mode sombre et laissait passer le texte de la liste ; le fondu utilise maintenant la même couleur que la barre latérale.</li><li><strong>Aperçu de fichier :</strong> le fond sous les pages d'un aperçu, comme les présentations, est plus foncé en mode sombre, les numéros de page suivent la couleur du texte et sont de nouveau lisibles, et le bord d'une diapositive a un fin trait en mode sombre.</li><li><strong>Nom du réglage :</strong> « Mode de couleur » dans Paramètres → Personnalisation → Apparence devient « Apparence ».</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.14.0": [
    "<strong>Notes de version de Noureon 17.14.0</strong>",
    "Cette version ajoute un mode sombre et regroupe les couleurs de l'interface sous un seul jeu de noms fixes.",
    "<strong>Changements principaux</strong>",
    "<ul><li><strong>Apparence :</strong> Paramètres → Personnalisation → Apparence propose une nouvelle option « Apparence » : clair, sombre ou selon le système. Le mode clair est le choix par défaut ; le choix s'applique aussitôt et est synchronisé avec les paramètres du cloud. Le thème sombre est un gris foncé.</li><li><strong>Tous les écrans :</strong> l'écran principal, la barre latérale, les conversations, tous les onglets des paramètres, les boîtes de dialogue, la boutique d'outils en ligne de commande, la boutique Nouras, la recherche, la recherche approfondie, le panneau des données personnelles et ses graphiques, ainsi que les panneaux de citations et de sources ont une version sombre ; les aperçus de fichiers (Word, PDF, présentations, tableurs) et les images générées gardent un fond blanc, comme du papier.</li><li><strong>Un seul jeu de couleurs :</strong> le texte a trois niveaux et les fonds trois couches, avec des lignes, un accent, des couleurs d'état et des ombres communs ; le texte pâle du thème clair (indications, heures des messages) est plus foncé, et son contraste sur blanc passe de 2,5 à environ 3,5.</li><li><strong>Écran de démarrage :</strong> en thème sombre, la page ne clignote plus en blanc à l'ouverture ; la barre du navigateur, la barre d'état d'une application installée et son écran de lancement sont sombres aussi. L'application de l'écran d'accueil sur iPhone et iPad a une image de démarrage claire et une sombre, selon l'apparence de l'appareil.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>L'image de démarrage sur iPhone et iPad suit l'apparence de l'appareil, et non l'apparence réglée dans l'application ; l'écran d'un nouveau modèle qui n'est pas encore répertorié démarre en blanc.</li><li>Après un changement du réglage d'apparence, une application installée ne change son écran de lancement qu'à la prochaine vérification de mise à jour du navigateur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données ; les paramètres gagnent un champ colorScheme que les anciennes versions ignorent."
  ],
  "17.13.0": [
    "<strong>Notes de version de Noureon 17.13.0</strong>",
    "Cette version transforme les Conditions d’utilisation, la Politique de confidentialité et les notes de mise à jour en pages web publiques autonomes, lisibles et partageables sans connexion.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Pages publiques :</strong> les Conditions d’utilisation (noureon.com/terms), la Politique de confidentialité (noureon.com/privacy) et les notes de mise à jour complètes (noureon.com/updates) ont chacune leur propre adresse. Elles ne nécessitent aucune connexion et ne chargent pas l’application. Les pages sont disponibles en 繁體中文, English, Français, Русский et Español ; la langue suit le réglage du navigateur et peut être changée en haut à droite de la page. Les modes clair et sombre suivent le système.</li><li><strong>Page des notes de mise à jour :</strong> les versions sont regroupées par mois et chacune dispose d’un lien partageable (par exemple noureon.com/updates#v17.13.0). La page comporte un sommaire qui se replie sur trois niveaux (année, mois, version) et ne garde ouvert que le mois en cours de lecture, de sorte qu’il reste court quel que soit le nombre de versions : sur ordinateur, il se trouve à droite et signale la version en cours de lecture pendant le défilement ; sur téléphone et dans les fenêtres étroites, le « Sommaire » se trouve sous le titre et, après défilement, reste dans une barre en haut de la fenêtre où il peut être ouvert. Une fois la page défilée, un bouton en bas à droite permet de revenir en haut de page. Les niveaux et le panneau du sommaire s’ouvrent et se ferment avec une courte animation.</li><li><strong>Notes de mise à jour en cinq langues :</strong> les notes de chaque version sont disponibles en 繁體中文, English, Français, Русский et Español. La page des notes affiche la langue sélectionnée et la fenêtre de nouvelle version affiche la langue de l’application.</li><li><strong>Points d’accès :</strong> « Conditions et politiques » et « Informations sur la version » dans les paramètres deviennent des liens qui s’ouvrent dans un nouvel onglet ; des liens vers les Conditions d’utilisation et la Politique de confidentialité sont ajoutés en bas de la page de connexion ; « Voir l’historique complet des mises à jour » dans la fenêtre de nouvelle version mène à la page des notes de mise à jour. L’ancienne fenêtre d’historique des mises à jour dans les paramètres et les sections dépliables des conditions ont été supprimées.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Les trois pages sont des pages web autonomes, extérieures à l’application, et ne sont pas mises en cache pour une utilisation hors ligne ; elles ne peuvent pas être ouvertes hors connexion.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.12.1": [
    "<strong>Notes de version de Noureon 17.12.1</strong>",
    "Cette version remplace Claude 4.5 Haiku sur OpenRouter par le nouveau Claude Haiku 5.5.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Claude Haiku 5.5 :</strong> remplace Claude 4.5 Haiku, dans le menu des modèles sous Anthropic. Prix : 0,10 USD par million de tokens en entrée et 0,50 USD en sortie (au-delà de 100 000 tokens de prompt : 0,50 USD en entrée et 2,50 USD en sortie) ; contexte de 1 million de tokens, jusqu’à 128 000 tokens en sortie par requête. Prend en charge les images et les fichiers en entrée, la sortie étant du texte ; utilisable pour les appels d’outils du mode Avancé (Python).</li><li><strong>Réflexion :</strong> cinq niveaux (Bas, Moyen, Élevé, Très élevé, Maximum), Moyen par défaut (comme la valeur par défaut de l’API Anthropic).</li><li><strong>Conversations existantes :</strong> les conversations, les groupes du conseil de modèles et les modèles récents qui utilisaient Claude 4.5 Haiku passent automatiquement à Claude Haiku 5.5.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Claude Haiku 5.5 utilise un tokenizer plus récent : un même texte représente environ 30 % de tokens de plus qu’avec Claude 4.5 Haiku, si bien que le coût réel ne diminue pas dans la même proportion.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.12.0": [
    "<strong>Notes de version de Noureon 17.12.0</strong>",
    "Cette version permet de retirer un modèle en cours de route d’un conseil de modèles, afin d’arrêter un modèle trop lent ou inadapté.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Retirer un modèle du conseil :</strong> pendant le conseil, un bouton « Quitter » apparaît à côté des modèles qui répondent encore. Un clic ouvre d’abord une fenêtre de confirmation ; après confirmation, ce modèle s’arrête immédiatement, sa réponse déjà produite n’est pas incluse dans le résultat du conseil, et les autres modèles terminent le conseil. Cela s’applique aux conseils exécutés sur cet appareil comme à ceux exécutés sur le serveur.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Le conseil doit conserver au moins 2 modèles ; le bouton « Quitter » n’apparaît donc pas lorsqu’il n’en reste que 2.</li><li>Le modèle chargé de la synthèse de la réponse finale ne peut pas quitter ; pour interrompre le conseil, cliquez sur « Arrêter ».</li><li>Le fournisseur peut encore facturer le contenu déjà produit avant le retrait du modèle.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.11.0": [
    "<strong>Notes de version de Noureon 17.11.0</strong>",
    "Cette version fait exécuter le conseil de modèles par le serveur : après l’envoi, le conseil se termine même si la page est fermée ou le téléphone verrouillé, et la réponse est déjà écrite dans la conversation à la réouverture.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Conseil de modèles exécuté sur le serveur :</strong> une fois connecté à un compte cloud, le conseil est exécuté par défaut par le serveur de Noureon. Tout le déroulement (réponses des membres, discussion, recherche et synthèse de la réponse) se fait sur le serveur ; à la réouverture de la page (ou en ouvrant la même conversation sur un autre appareil), le même panneau de progression est rattaché et continue d’afficher la production de la réponse de synthèse. Le bouton « Arrêter » est disponible à tout moment et le texte de synthèse déjà produit est conservé.</li><li><strong>Reprise après redémarrage du serveur :</strong> les réponses des membres et les recherches déjà terminées sont conservées temporairement ; après un redémarrage, seule la synthèse est refaite, sans interroger de nouveau chaque modèle.</li><li><strong>Le dépassement de délai d’un modèle n’affecte pas le conseil :</strong> chaque appel de modèle attend au plus 30 minutes ; au-delà, ce membre est considéré comme en échec et les autres membres terminent normalement.</li><li><strong>Plus de flash blanc à l’ouverture des Paramètres :</strong> correction du bref affichage blanc de l’écran lors de la première ouverture des Paramètres sur téléphone.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Un compte cloud est requis ; si « Cet appareil » est choisi, sans connexion, en discussion temporaire, avec des clés incomplètes ou une requête trop volumineuse (plus de 25 Mo), le conseil reste exécuté dans le navigateur ; il bascule aussi automatiquement sur cet appareil si le serveur est injoignable.</li><li>Les clés API des fournisseurs utilisées par le conseil (et la clé de recherche) sont conservées chiffrées temporairement et supprimées à la fin du conseil, au plus tard au bout de 2 h 15 ; l’historique de la conversation, les messages, les pièces jointes et les réponses de chaque modèle transitent par le serveur — voir la page Confidentialité et la politique de confidentialité.</li><li>Si le serveur redémarre pendant la synthèse, celle-ci est refaite une fois et le fournisseur concerné peut facturer deux fois.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.10.0": [
    "<strong>Notes de version de Noureon 17.10.0</strong>",
    "Cette version fait exécuter par le serveur la recherche web des modèles qui ne savent pas chercher eux-mêmes : après l’envoi, la recherche et la réponse se terminent même si la page est fermée ou le téléphone verrouillé.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Recherche exécutée par le serveur :</strong> lorsque la recherche web est activée et que le modèle ne peut ni chercher ni appeler d’outils (par exemple certains modèles NVIDIA et OpenRouter), le serveur formule les termes de recherche d’après la conversation, cherche sur le web, puis remet les pages obtenues au modèle pour qu’il réponde. La réponse affiche toujours « N sites consultés » et les étiquettes de source [n] ; pendant la recherche, « Recherche avec Tavily (ou TinyFish) en cours » s’affiche.</li><li><strong>Profondeur de recherche et solution de secours :</strong> la profondeur de recherche Tavily choisie dans les Paramètres (Basic / Advanced) s’applique désormais aussi sur le serveur (auparavant, la recherche sur le serveur était toujours Basic) ; si le service de recherche choisi ne renvoie aucun résultat ou une erreur, l’autre service est utilisé (les clés des deux doivent être configurées), comme dans le navigateur.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Un compte cloud est requis ; si « Cet appareil » est choisi, sans connexion, en discussion temporaire ou avec une requête trop volumineuse, la recherche et la réponse restent exécutées dans le navigateur. Elles basculent aussi automatiquement sur cet appareil si le serveur est injoignable.</li><li>Les clés de recherche (Tavily, TinyFish), comme les clés API, sont conservées chiffrées temporairement et supprimées à la fin de la réponse ; les termes de recherche et les pages obtenues transitent par le serveur — voir la page Confidentialité et la politique de confidentialité.</li><li>Si le serveur redémarre pendant la recherche, celle-ci peut être refaite une fois.</li><li>Dans cette version, la recherche du conseil de modèles reste exécutée dans le navigateur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.9.2": [
    "<strong>Notes de version de Noureon 17.9.2</strong>",
    "Cette version ajoute un message lorsqu’une réponse du serveur échoue, atténue le scintillement de l’écran à l’ouverture des Paramètres sur téléphone et corrige l’impossibilité de faire glisser les conversations courtes sur téléphone.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Message en cas d’échec :</strong> si vous fermez la page après l’envoi d’un message et que le serveur n’a pas pu terminer la réponse ni écrire l’erreur dans la conversation, une explication s’affiche après votre message à la réouverture de la conversation (par exemple « Le serveur n’a pas pu terminer cette réponse. »). Elle n’apparaît qu’une fois par échec et ne revient plus après suppression.</li><li><strong>Ouverture des Paramètres plus fluide :</strong> auparavant, à chaque ouverture des Paramètres, le contenu était recréé pendant le glissement de l’écran (surtout à la première ouverture), ce qui provoquait un scintillement sur téléphone. Désormais, la première ouverture attend que le contenu soit prêt avant de faire glisser l’écran, et les ouvertures suivantes ne le recréent plus.</li><li><strong>Conversations courtes déplaçables :</strong> les conversations d’un ou deux messages ne pouvaient pas être déplacées au doigt sur iPhone. Comme pour les longues conversations, l’écran suit désormais le doigt puis revient en place.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Seules sont ajoutées les réponses échouées au cours des dernières 24 heures et survenues après le dernier message de l’utilisateur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.9.1": [
    "<strong>Notes de version de Noureon 17.9.1</strong>",
    "Cette version corrige un problème : lors de la génération d’images par le serveur, l’image était terminée mais ne s’affichait pas dans la conversation.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Correction de l’image non affichée :</strong> dans la génération d’images par le serveur de la version 17.9.0, la position du message était mal calculée lors de l’écriture de l’image dans la conversation et chevauchait celle du message de l’utilisateur, ce qui empêchait l’écriture de l’image. Désormais, l’image est écrite après le message de l’utilisateur et reste visible après la fermeture puis la réouverture de la page.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Les demandes d’image envoyées pendant la version 17.9.0 et qui ont échoué doivent être renvoyées.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.9.0": [
    "<strong>Notes de version de Noureon 17.9.0</strong>",
    "Cette version prend en charge la génération d’images par le serveur : après l’envoi, l’image se termine même si la page est fermée ou le téléphone verrouillé, et elle est déjà écrite dans la conversation à la réouverture. Elle corrige aussi le réglage « Cet appareil » pour les réponses.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Génération d’images sur le serveur :</strong> une fois connecté à un compte cloud, la génération d’images est exécutée par défaut par le serveur de Noureon. Après l’envoi, vous pouvez fermer la page, verrouiller le téléphone ou changer d’appareil ; l’image apparaît automatiquement dans la conversation une fois terminée ; si vous rouvrez la page pendant la génération, « Création de l’image » s’affiche et la génération n’est pas relancée. Le bouton « Arrêter » est disponible à tout moment.</li><li><strong>Suppression des aperçus :</strong> l’aperçu progressif des modèles d’images GPT a été supprimé ; pendant la génération, seul « Création de l’image » s’affiche, puis l’image complète apparaît une fois terminée.</li><li><strong>Le réglage « Cet appareil » pour les réponses est désormais respecté :</strong> auparavant, même lorsque « Cet appareil » était choisi dans l’onglet Confidentialité des Paramètres, les réponses textuelles étaient quand même traitées par le serveur ; désormais, avec ce choix, les réponses textuelles et la génération d’images se font uniquement dans ce navigateur.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>La génération d’images par le serveur nécessite un compte cloud ; si « Cet appareil » est choisi, sans connexion, en discussion temporaire, ou si les images de référence jointes sont trop volumineuses (plus de 25 Mo), la génération reste effectuée dans le navigateur. Elle bascule aussi automatiquement sur cet appareil si le serveur est injoignable.</li><li>Le serveur conserve temporairement la clé OpenRouter, chiffrée, et la supprime à la fin de la génération de l’image, au plus tard au bout de 30 minutes ; le prompt et les images de référence transitent par le serveur, et l’image terminée est enregistrée dans l’espace cloud de l’utilisateur — voir la page Confidentialité et la politique de confidentialité.</li><li>Si le serveur redémarre pendant la génération d’une image, la requête peut être renvoyée une fois, et le compte OpenRouter peut être facturé deux fois.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.8.2": [
    "<strong>Notes de version de Noureon 17.8.2</strong>",
    "Cette version ajoute le modèle de génération d’images FLUX.3 Image (Black Forest Labs) et prend en charge davantage de formats d’image et de niveaux de qualité.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>FLUX.3 Image :</strong> dans le menu des modèles, sous Black Forest Labs. Peut s’appuyer simultanément sur jusqu’à 10 images pour les modifier ou les combiner, et génère directement des images jusqu’en 4K.</li><li><strong>Plus de qualités et de formats :</strong> FLUX.3 Image propose cinq qualités (768, 1K, 1.5K, 2K, 4K) et 15 formats, dont 1:1, 16:9, 9:16, 3:2, 4:3, 7:5, 5:7, 9:21 et 21:9. Les nouvelles qualités 768 et 1.5K ainsi que les formats 7:5 et 5:7 n’apparaissent dans le menu que pour les modèles qui les prennent en charge.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Une clé OpenRouter est requise ; FLUX.3 Image est facturé à l’image, et plus la qualité est élevée, plus le coût l’est (la 4K est nettement plus chère que la 1K) : surveillez votre consommation.</li><li>FLUX.3 Image ne prend pas en charge le réglage de graine (seed) ; renseigner une graine dans les paramètres avancés peut provoquer un échec.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.8.1": [
    "<strong>Notes de version de Noureon 17.8.1</strong>",
    "Cette version remplace les modèles de génération d’images de Google par le nouveau Nano Banana 2.1 et affiche dans les Paramètres le mode de stockage actuel des données.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Nouveau modèle de génération d’images :</strong> Gemini 3.1 Flash Image, Gemini 3.1 Flash Lite Image et Gemini 3 Pro Image sont regroupés en « Gemini Nano Banana 2.1 ». Il prend en charge les formats 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9 et 21:9, ainsi que des formats très étroits ou très larges tels que 1:4, 4:1, 1:8 et 8:1 ; trois qualités sont proposées : 1K, 2K et 4K.</li><li><strong>Passage automatique au nouveau modèle :</strong> les conversations et réglages qui utilisaient les anciens modèles passent automatiquement au nouveau ; la qualité 512 précédemment choisie devient 1K, car le nouveau modèle n’a pas de 512.</li><li><strong>Mode de stockage affiché dans les Paramètres :</strong> une ligne en petits caractères a été ajoutée tout en bas de Gestion des Données pour indiquer que les données utilisent désormais le stockage séparé ; l’absence de cette ligne signifie que l’ancien mode de stockage est toujours utilisé.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>La génération d’images nécessite une clé OpenRouter ; les qualités 2K et 4K coûtent plus cher que la 1K.</li><li>Google mettra fin à l’ancien Gemini 3.1 Flash Image le 29 octobre 2026 ; cette mise à jour a déjà basculé vers le nouveau modèle, aucune action n’est requise de la part de l’utilisateur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.8.0": [
    "<strong>Notes de version de Noureon 17.8.0</strong>",
    "Cette version améliore la vitesse d’ouverture de la page et l’utilisation de la mémoire : pour les comptes volumineux (en particulier ceux contenant beaucoup d’images), l’ouverture ne provoque plus de ralentissements ni d’utilisation excessive de la mémoire.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Ouverture plus rapide et moins de mémoire :</strong> les conversations ne sont plus enregistrées en un seul bloc fusionné, mais séparément, chacune de son côté, et sont lues une par une à l’ouverture, au lieu de charger toutes les données en mémoire d’un coup.</li><li><strong>Images et pièces jointes stockées séparément :</strong> les images et fichiers des conversations ne sont plus enregistrés avec le texte, ce qui rend l’affichage plus fluide et la sauvegarde plus rapide.</li><li><strong>Sauvegarde plus légère :</strong> seules les conversations modifiées sont enregistrées à nouveau, au lieu de réécrire l’ensemble des données à chaque fois.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>À la première ouverture après la mise à jour, quelques secondes sont nécessaires pour réorganiser les données selon le nouveau mode de stockage : attendez l’affichage de l’écran avant d’agir ; cela peut prendre plus de temps pour les comptes volumineux.</li><li>Une fois la réorganisation terminée, une vérification est effectuée et le nouveau mode n’est activé que si tout est correct ; en cas d’échec, les données d’origine restent utilisées automatiquement, sans aucune perte.</li><li>Les anciennes données sont conservées au moins 30 jours supplémentaires, puis supprimées automatiquement une fois que tout fonctionne normalement.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour réorganise automatiquement les données une fois sur l’appareil de l’utilisateur, sans aucune action manuelle ; la synchronisation cloud et la mémoire fonctionnent comme d’habitude, et l’utilisation sur plusieurs appareils n’est pas affectée."
  ],
  "17.7.0": [
    "<strong>Notes de version de Noureon 17.7.0</strong>",
    "Cette version ajoute les « outils CLI » : l’IA peut utiliser des programmes en ligne de commande tels qu’OfficeCLI ou FFmpeg, exécutés dans un bac à sable isolé sur le serveur ; les fichiers produits s’affichent sous la réponse.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Boutique d’outils CLI :</strong> « CLI » est ajouté à la barre latérale gauche (adresse noureon.com/cli). Sont proposés officiellement : OfficeCLI (Word, Excel, PowerPoint), FFmpeg (audio et vidéo), yt-dlp (téléchargement de vidéos et d’audio), csvkit (CSV), Pandoc (conversion de documents), SoX (audio), twitter-cli et rdt-cli. Après l’ajout avec « ＋ », tapez @ dans la zone de saisie pour en choisir un ; la page de détails de chaque outil décrit son usage et ses limites.</li><li><strong>Demande avant l’accès au réseau :</strong> lorsqu’un outil veut se connecter à un site, une demande est faite la première fois pour chaque site (« Autoriser cette fois », « Toujours autoriser », « Refuser ») ; les adresses internes ne sont jamais accessibles.</li><li><strong>Nouveau réglage « Autorisations » :</strong> permet de définir la façon de demander l’accès au réseau, de gérer les règles par site, de laisser l’IA utiliser seule un outil et de conserver les identifiants dont les outils ont besoin pour se connecter (identifiants sécurisés, conservés chiffrés, pouvant être consultés et supprimés).</li><li><strong>Vérification visuelle :</strong> le délai d’attente pour vérifier et refaire une présentation est allongé, ce qui réduit les cas où le résultat reste inchangé à cause d’un dépassement de délai.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Les outils CLI nécessitent un compte cloud et s’utilisent avec les réponses du serveur.</li><li>twitter-cli et rdt-cli nécessitent que l’utilisateur fournisse lui-même ses identifiants de connexion ; les conditions d’utilisation de X et de Reddit n’autorisent pas l’accès automatisé et le compte peut être restreint. Avec yt-dlp, il vous appartient de respecter les conditions de chaque site et le droit d’auteur.</li><li>Les logiciels tiers et leurs licences sont consultables en bas de la page des Paramètres.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données côté utilisateur ; les nouveaux réglages sont synchronisés avec les réglages cloud."
  ],
  "17.6.0": [
    "<strong>Notes de version de Noureon 17.6.0</strong>",
    "Cette version ajoute la « Recherche approfondie » : à partir d’un sujet donné, le système établit d’abord un plan de recherche, puis cherche et lit seul un grand nombre de pages web, et produit enfin un rapport complet avec citations. Elle continue de s’exécuter sur le serveur après la fermeture de la page.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Recherche approfondie :</strong> choisissez « Recherche approfondie » dans le menu « ＋ » de la zone de saisie. Après l’envoi, le plan de recherche s’affiche d’abord ; la recherche démarre à la fin du compte à rebours, et vous pouvez aussi cliquer sur « Modifier » pour le changer ou sur « Lancer » pour démarrer immédiatement.</li><li><strong>Affichage de la progression :</strong> pendant la recherche, un pourcentage de progression et l’étape en cours s’affichent ; vous pouvez la mettre en pause ou l’arrêter, et ajouter des consignes à tout moment dans la zone de saisie, la suite de la recherche s’adaptant à ces consignes.</li><li><strong>Rapport complet :</strong> le rapport comporte des citations et peut être lu en plein écran, avec un sommaire à gauche ; à droite, on peut consulter les sources et le déroulement de la recherche, et des graphiques sont ajoutés lorsque les données le permettent. Il peut être téléchargé en PDF, Word ou Markdown.</li></ul>",
    "<strong>Remarques</strong>",
    "<ul><li>Un compte cloud est requis, ainsi qu’une clé de recherche renseignée dans les Paramètres ; les modèles Gemini ne sont pour l’instant pas pris en charge.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données."
  ],
  "17.5.0": [
    "<strong>Notes de version de Noureon 17.5.0</strong>",
    "Cette version permet de générer les réponses sur le serveur de Noureon : après l’envoi, la réponse se termine même si vous fermez la page, verrouillez le téléphone ou changez d’appareil, et elle est déjà écrite dans la conversation à la réouverture. Les Paramètres gagnent un onglet « Confidentialité » où l’on choisit de générer les réponses sur le serveur ou sur cet appareil.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Réponses du serveur :</strong> par défaut, les réponses sont désormais générées par le serveur (compte cloud requis). La réponse est synchronisée au fur et à mesure de son écriture ; tant que la page est ouverte, elle s’affiche toujours mot à mot et les autres appareils la voient en direct ; « Arrêter » prévient le serveur de s’arrêter et conserve ce qui est déjà écrit ; chaque utilisateur peut avoir au plus 5 réponses simultanées, chacune d’une durée maximale de 2 heures ; lorsque le serveur est mis à jour ou redémarré, les réponses en cours reprennent automatiquement à partir du dernier point de sauvegarde.</li><li><strong>Synchronisation en direct et reprise :</strong> le serveur envoie en direct à tous les onglets et appareils ouverts chaque petit morceau de texte de la réponse, le raisonnement et les pages web trouvées, de sorte que tous voient en même temps le même contenu ; si vous fermez la page, changez d’onglet ou de conversation puis revenez, et que la réponse est encore en cours de génération, la progression actuelle s’affiche d’abord, puis l’affichage se poursuit en synchronisation avec les autres onglets ; une réponse déjà terminée est la réponse complète. Si le canal en direct est inaccessible, les messages enregistrés sont lus automatiquement à la place.</li><li><strong>Toujours une sortie en direct :</strong> les réglages « Mode de sortie » et « Effet machine à écrire après la sortie complète » sont supprimés, les réponses s’affichent toujours pendant leur génération ; ceux qui avaient choisi la machine à écrire passent automatiquement à la sortie en direct.</li><li><strong>Python aussi exécuté sur le serveur :</strong> les réponses du mode Avancé qui nécessitent d’exécuter Python (traitement de fichiers et de données, production de Word / PowerPoint / Excel / PDF et de graphiques) sont désormais exécutées dans un conteneur du serveur isolé de l’extérieur : sans accès au réseau, avec mémoire et durée limitées, et supprimé à la fin de la réponse. La liste des étapes s’affiche en direct dans chaque onglet et la réponse se termine même si la page est fermée ; les fichiers Word et PowerPoint produits intègrent les polices libres fournies avec Noureon, de sorte qu’ils s’affichent correctement sur un autre ordinateur ; les fichiers produits sont enregistrés dans l’espace cloud de l’utilisateur et s’affichent sous le message à la réouverture. Les fichiers précédents de la conversation ne sont plus transmis que par leur emplacement dans le cloud, au lieu d’être renvoyés à chaque envoi.</li><li><strong>En cas de problème du bac à sable :</strong> si le VPS est injoignable ou le bac à sable inutilisable, les réponses Python passent automatiquement dans le navigateur de l’utilisateur ; une brève coupure pendant l’exécution déclenche automatiquement une nouvelle tentative avec un nouveau bac à sable ; si la nouvelle tentative échoue alors que la page est toujours ouverte et que le modèle n’a pas encore écrit de réponse, le travail est aussi rendu au navigateur pour être refait.</li><li><strong>Vérification visuelle effectuée sur le serveur :</strong> une fois la présentation écrite dans la réponse, le serveur dessine automatiquement les diapositives sous forme d’images, demande au modèle de les vérifier visuellement et corrige les problèmes (pour une présentation faite avec Python, le modèle est invité à la refaire), puis écrit le résultat sous la forme d’une nouvelle réponse. Cela se termine même si la page est fermée ; tous les onglets et appareils voient la même ligne de progression, aucun onglet ne peut envoyer de message pendant cette période, et « Arrêter » permet de l’interrompre. Si le serveur ne parvient pas à dessiner les images, la vérification est effectuée comme auparavant par le navigateur.</li><li><strong>Onglet Confidentialité :</strong> indique où les réponses sont exécutées, ce qui est envoyé lorsque le serveur est choisi, les fonctions qui s’exécutent actuellement toujours sur cet appareil et où les données sont conservées. Les clés API ne sont conservées chiffrées que temporairement, jusqu’à la fin de la réponse (2 h 15 au plus), jamais durablement, et n’apparaissent ni dans les journaux ni dans les messages d’erreur.</li><li><strong>Retour automatique sur cet appareil :</strong> si le serveur est injoignable, si trop de réponses sont en cours simultanément, ou si la réponse utilise la recherche web d’un modèle qui ne prend pas en charge l’appel d’outils, la réponse est générée automatiquement sur cet appareil ; un court message l’indique lorsque le serveur est injoignable ou trop occupé.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>La recherche web des modèles qui ne prennent pas en charge l’appel d’outils, la saisie vocale et la caméra s’exécutent actuellement toujours sur cet appareil.</li><li>Le nombre de réponses Python simultanées est limité ; les réponses en excès sont mises en file d’attente.</li><li>Les réponses sans connexion à un compte cloud et celles des discussions temporaires sont également générées sur cet appareil.</li><li>Lors d’une mise à jour du serveur, le flux de modèle en cours est refait une fois.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Après la mise à jour, les réponses sont générées par défaut par le serveur ; pour rester en local, choisissez « Cet appareil » dans « Paramètres → Confidentialité ». Les appareils qui n’ont pas encore été mis à jour affichent normalement les réponses écrites par le serveur."
  ],
  "17.4.0": [
    "<strong>Notes de version de Noureon 17.4.0</strong>",
    "Cette version permet aux modèles qui utilisent des outils de chercher eux-mêmes sur le web et de lire des pages, et ajoute les citations intégrées : de petites étiquettes de site apparaissent aux endroits cités dans la réponse, des boutons de sources se trouvent en dessous, et la barre latérale droite gagne deux onglets, Chronologie et Sources.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Recherche autonome du modèle :</strong> les modèles qui appellent des outils (y compris en mode Avancé) peuvent chercher eux-mêmes dans leur réponse, ouvrir des pages web et rechercher un mot dans une longue page, jusqu’à vingt appels, et décident eux-mêmes de chercher ou non ; les recherches et pages demandées dans un même tour sont obtenues ensemble, une source de recherche en échec est remplacée par une autre, le contenu récemment cherché est conservé temporairement et les résultats de recherche portent la date des données. Les termes de recherche sont désormais rédigés d’après la conversation par le modèle qui répond.</li><li><strong>Citations intégrées :</strong> après chaque phrase citée dans la réponse apparaît une petite étiquette grise arrondie (icône et nom du site ; avec plusieurs sources, « nom du site +1 »). Avec une seule source, un clic l’ouvre directement dans un nouvel onglet ; avec plusieurs, un panneau inférieur « N sources » s’affiche. Les citations sont indiquées pour les sources de la recherche intégrée au modèle, pour les modèles qui appellent des outils et pour les modèles ordinaires. À la copie d’une réponse, les marques de citation et le journal d’exécution ne sont pas copiés.</li><li><strong>Bouton de sources et onglet Sources :</strong> sous les réponses avec sources, à côté du bouton de copie, un bouton « Sources » (trois icônes de sites superposées) est ajouté : sur téléphone il ouvre le panneau inférieur, sur ordinateur l’onglet Sources de la barre latérale droite. Chaque ligne de source affiche l’icône du site, le nom que le site déclare lui-même, le titre, la date et un résumé de deux lignes ; les sources s’ouvrent directement, sans fenêtre de confirmation, et la notification correspondante a été supprimée.</li><li><strong>Barre latérale droite :</strong> « Sommaire des messages » est renommé « Chronologie » et forme avec « Sources » deux onglets ; la barre est élargie, et sur ordinateur (1024 px et plus), à l’ouverture elle repousse la page de conversation, sans voile blanc, et reste ouverte jusqu’à un clic sur fermer, la touche Échap ou le nouveau bouton de panneau à droite de la barre de titre. Le comportement qui la faisait surgir quand la souris touchait le bord de l’écran est supprimé, car cette zone sensible recouvrait la barre de défilement de la conversation. La chronologie devient des points noir et blanc reliés par un trait fin, affiche l’interlocuteur et jusqu’à trois lignes de contenu, et n’affiche plus les marques de gras, de titre, etc. (sauf pour les tableaux). Lorsque le panneau est ouvert, il suit la conversation : il est redessiné automatiquement après un changement de conversation, la fin d’une réponse, une modification ou une suppression.</li><li><strong>Panneau de sources sur téléphone :</strong> il occupe toute la largeur, collé au bas de l’écran, suit le doigt uniquement par déplacement, peut être tiré jusqu’à presque tout l’écran et se ferme en le tirant vers le bas.</li><li><strong>Affichage des adresses :</strong> dans la zone de saisie et dans les messages envoyés, les adresses s’affichent sous la forme d’une icône de site et d’un lien court.</li></ul>",
    "<strong>Corrections et améliorations</strong>",
    "<ul><li><strong>Barres de défilement :</strong> style unifié sur tout le site : fines, avec un curseur gris arrondi et sans fond de piste. Un clic sur les flèches aux extrémités des barres verticales fait défiler en 0,5 seconde, avec amorti, tout en haut ou tout en bas ; la zone de saisie ne recouvre plus la partie basse de la barre de défilement de la conversation.</li><li><strong>Dégradés :</strong> un fondu est ajouté sous la barre de recherche et au-dessus de la barre de compte de la barre latérale gauche, ainsi que sous les onglets et en bas de la barre latérale droite, de sorte que le contenu qui défile n’est plus coupé net par une ligne.</li><li><strong>Surbrillance des sources et de la chronologie :</strong> la ligne survolée par la souris suit en temps réel pendant le défilement, sans attendre la fin du défilement ; la chronologie n’a plus de fond gris qui reste bloqué.</li><li><strong>Ouverture et fermeture des barres latérales :</strong> correction du cas où, la barre latérale droite étant ouverte (fenêtre de moins de 1024 px), un clic sur le bouton de menu en haut à gauche fermait la barre droite sans pouvoir ouvrir la barre gauche ; correction du voile transparent qui, sur ordinateur, continuait de couvrir la page de conversation après la fermeture de la barre droite et la rendait impossible à cliquer.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>Le nom et la date des sources dépendent des données fournies par chaque site et par les services de recherche ; lorsqu’un site n’a pas de nom, l’adresse est affichée.</li><li>L’onglet « Sources » de la barre latérale droite ne liste que les sources de la dernière réponse qui en comporte, ou de la réponse sur laquelle l’utilisateur a cliqué, et non une liste cumulée de toute la conversation.</li><li>Les flèches aux extrémités des barres de défilement sont dessinées par le navigateur ; elles n’existent que dans les navigateurs de certains systèmes d’ordinateur, pas sur téléphone.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les sources du journal d’exécution d’une réponse gagnent des champs de numéro, de date et de résumé, enregistrés avec le message ; les appareils qui n’ont pas encore été mis à jour ignorent ces champs et affichent toujours les sources dans l’ancien style. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.3.1": [
    "<strong>Notes de version de Noureon 17.3.1</strong>",
    "Cette version réduit les étapes en cours à une seule ligne, apporte plusieurs corrections à la vérification visuelle et à la modification, et fait passer l’icône de site de la barre de recherche au site suivant lorsque le premier n’en a pas.",
    "<strong>Corrections et améliorations</strong>",
    "<ul><li><strong>Étapes en cours :</strong> pendant la production d’une réponse, le déroulement est réduit à une ligne indiquant où en est le travail, et les étapes ne se voient qu’en l’ouvrant (réglable dans les Paramètres pour qu’elles soient ouvertes par défaut) ; la réflexion du modèle devient une étape sous « En cours », et le chronomètre de l’étape s’arrête à la fin. Lorsque le modèle reste silencieux un moment, « Écriture du code… » s’affiche et ce qu’il a dit pendant ce silence se déploie progressivement, au lieu d’apparaître d’un coup. Les réponses qui se contentent de chercher sur le web, sans exécuter de code, ont aussi la même ligne « Temps de traitement ». Le but de chaque étape est désormais indiqué par le champ note de l’appel, et plus par un texte écrit avant l’appel, si bien que chaque mot produit fait partie de la réponse et s’affiche dès son apparition.</li><li><strong>Vérification visuelle :</strong> la capture de la diapositive n’est faite qu’après le chargement des polices, de sorte que les images vues par le modèle contiennent du texte ; lorsque la réponse de la vérification visuelle est illisible, le modèle est interrogé une nouvelle fois, sans limite de longueur, et la cause est expliquée dans chaque langue ; le message auquel appartient la vérification est retrouvé dans la conversation en direct grâce à son numéro, ce qui corrige le rejet d’une présentation refaite après actualisation et le rejet erroné du résultat lorsque le message est introuvable.</li><li><strong>Icônes de site :</strong> les icônes sont désormais récupérées par le serveur de Noureon (sans passer par un service d’icônes tiers), les sites sans icône n’affichent plus de blanc ; dans la barre de recherche, l’icône passe au site suivant lorsque le premier n’en a pas, jusqu’à en trouver une.</li><li><strong>Modification et envoi :</strong> une conversation tronquée par une modification reste tronquée (le point de troncature est marqué et prime sur une copie plus longue, et les messages supprimés par la troncature sont synchronisés avec le cloud par suppression) ; la réponse et la vérification visuelle sont arrêtées avant la troncature par modification ; la notification de verrouillage de l’envoi s’affiche en entier.</li><li><strong>Autres :</strong> la marque « [File: nom du fichier] » glissée dans une réponse est supprimée lorsqu’une carte de fichier existe, et il est rappelé au modèle de ne pas l’écrire ; la flèche de la barre repliée sur téléphone se retourne ; la conversation reste défilable même si son contenu est très court ; le bouton de fermeture de l’aperçu de fichier n’a plus de contour de focus. Les réglages de synchronisation cloud gagnent un bouton « Synchroniser maintenant » et l’état de synchronisation de chaque type de données.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.3.0": [
    "<strong>Notes de version de Noureon 17.3.0</strong>",
    "Cette version permet de choisir Tavily ou le TinyFish gratuit pour la recherche web des modèles OpenRouter et NVIDIA, et ajoute la lecture des adresses contenues dans les messages ; elle ajoute aussi le retrait automatique des modèles arrivés à échéance, le verrouillage de l’envoi pendant la vérification visuelle, et un nouveau réglage du défilement en bas de la conversation sur iPhone.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Source de recherche au choix :</strong> « Source de recherche » est ajouté aux Paramètres, avec le choix entre Tavily et TinyFish ; seule la clé API de la source choisie est nécessaire ; en choisissant TinyFish, le champ de la clé TinyFish et le lien pour en obtenir une s’affichent. Tavily reste le choix par défaut et les réglages existants ne sont pas affectés.</li><li><strong>Lecture des adresses des messages :</strong> les modèles OpenRouter et NVIDIA ne peuvent pas ouvrir eux-mêmes les liens ; lorsqu’un message contient une adresse, l’application lit d’abord le texte de la page avant de le remettre au modèle. La fonction de lecture de la source de recherche choisie est utilisée en priorité (Tavily Extract ou TinyFish Fetch) ; sans clé, ou pour les pages illisibles, l’autre source prend le relais, une seule des deux clés suffisant. Au plus 5 adresses sont lues à la fois, avec au plus 15 000 caractères par page et une limite totale d’environ 45 000 caractères.</li><li><strong>Recherche déclenchée par une adresse :</strong> lorsqu’un message contient une adresse, la recherche web est activée pour cette requête quel que soit le réglage de recherche automatique (si le modèle peut chercher et que la clé est configurée), et une notification d’activation automatique s’affiche ; l’interrupteur de recherche de la conversation elle-même ne change pas.</li><li><strong>Résultats de lecture et explication des échecs :</strong> une ligne de source « N pages lues » est ajoutée au-dessus de la réponse, séparée de « N sites consultés ». Lorsqu’une adresse ne peut pas être lue, ou qu’aucune clé de lecture n’est configurée, le modèle en est informé et doit l’expliquer honnêtement à l’utilisateur, sans deviner le contenu de la page. Le conseil lit aussi les adresses et les fournit aux membres du premier tour et au modèle de synthèse.</li><li><strong>Retrait automatique des modèles arrivés à échéance :</strong> un modèle qui a une date de retrait est supprimé automatiquement de la liste des modèles le jour de cette date ; les conversations et réglages enregistrés qui utilisaient ce modèle passent au modèle par défaut, sans suppression manuelle. Un modèle de test, Space Bunny Alpha (OpenRouter, gratuit, prend en charge les images et la vidéo en entrée, niveaux de réflexion de bas à maximum), est ajouté ; son retrait est prévu le 2026-10-05 et la date de retrait s’affiche dans le menu.</li><li><strong>Envoi verrouillé pendant la vérification visuelle :</strong> tant que la vérification visuelle automatique d’une présentation est en cours, la conversation ne peut pas envoyer de nouveau message et la zone de saisie en indique la raison ; le verrou est levé dès la fin de la vérification ou un clic sur « Arrêter ».</li></ul>",
    "<strong>Corrections</strong>",
    "<ul><li><strong>Défilement en bas de la conversation sur iPhone :</strong> suppression de l’écouteur tactile qui empêchait le zoom à deux doigts et pouvait retarder le glissement lorsque la page était occupée (remplacé par les événements de geste de Safari) ; lorsque le signal de relâchement du doigt est perdu, la protection du défilement ne croit plus que le doigt est toujours posé ; la conversation ainsi que les blocs de réflexion, de code et de sortie conservent en bas une petite marge de défilement supplémentaire, afin qu’un glissement commençant tout en bas défile normalement.</li><li><strong>Espacement de la ligne de réflexion :</strong> correction de la flèche de déploiement collée au nombre de secondes.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>La lecture des adresses dépend des services de Tavily ou de TinyFish ; les PDF, les sites exigeant une connexion ou bloquant la lecture automatique peuvent ne pas être lisibles, et le modèle l’indique alors honnêtement.</li><li>Selon des évaluations de tiers, la recherche TinyFish peut être moins performante que la recherche Advanced de Tavily pour des requêtes complexes à conditions multiples ; les formats de réponse de TinyFish et de Tavily Extract sont implémentés d’après leur documentation : si les résultats de lecture sont anormaux, merci de le signaler.</li><li>Si le défilement pose encore problème sur iPhone, merci de joindre un enregistrement d’écran à votre signalement.</li><li>Space Bunny Alpha est un modèle de test anonyme dont le fournisseur peut ajuster le comportement avant son retrait.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les réglages gagnent un champ de source de recherche et une clé TinyFish ; sans configuration, Tavily est conservé. La clé TinyFish, comme les autres clés API, est classée parmi les réglages sensibles et masquée lors de l’exportation. Le journal d’exécution des réponses gagne une marque « lu » pour les sources, que les appareils non mis à jour ignorent."
  ],
  "17.2.1": [
    "<strong>Notes de version de Noureon 17.2.1</strong>",
    "Cette version remplace Claude Sonnet 5 et OpenAI GPT-6 Sol sur OpenRouter par les plus récents Claude Sonnet 5.5 et GPT-6.1 Sol.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Claude Sonnet 5.5 :</strong> remplace Claude Sonnet 5. Le prix reste de 2 USD par million de tokens en entrée et 10 USD en sortie ; prend en charge les images et les fichiers en entrée ; la réflexion comporte cinq niveaux (Bas, Moyen, Élevé, Très élevé, Maximum), Élevé par défaut.</li><li><strong>OpenAI GPT-6.1 Sol :</strong> remplace OpenAI GPT-6 Sol. Le prix reste de 2 USD par million de tokens en entrée et 10 USD en sortie ; prend en charge les images et les fichiers en entrée. La réflexion devient Bas, Moyen, Élevé, Très élevé, Maximum, le « mode rapide » n’est plus proposé et la valeur par défaut est Moyen.</li><li><strong>Mode Avancé de GPT-6.1 Sol :</strong> la documentation d’OpenAI indique que les appels d’outils de ce modèle nécessitent l’API Responses ; à chaque tour d’une réponse en mode Avancé (Python), il passe donc par l’API Responses d’OpenRouter, les résumés de réflexion s’affichent toujours en direct, et la réflexion et les appels d’outils du modèle sont repris tels quels d’un tour à l’autre ; les conversations ordinaires, le mode Standard et les autres modèles conservent leur mode d’appel d’origine.</li><li><strong>Conversations existantes :</strong> les conversations, les groupes du conseil de modèles et les modèles récents qui utilisaient Sonnet 5 ou GPT-6 Sol passent automatiquement à la nouvelle version ; une conversation GPT-6 Sol réglée sur le « mode rapide » passe au niveau par défaut, « Moyen ».</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>Le chemin de l’API Responses utilisé par GPT-6.1 Sol en mode Avancé est implémenté d’après la documentation d’OpenAI et d’OpenRouter ; si une erreur survient en mode Avancé, merci de signaler le message d’erreur.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.2.0": [
    "<strong>Notes de version de Noureon 17.2.0</strong>",
    "Cette version transforme le déroulement du mode Avancé en un panneau de traitement à une ligne par étape, ajoute la ligne de sources de la recherche web et permet à Gemini d’utiliser en même temps la recherche intégrée et Python.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Panneau de traitement :</strong> au-dessus de la réponse s’affiche une ligne « Traité en 10m 28s » ; une fois dépliée, chaque étape est une ligne de texte gris, dépliable séparément. Les étapes de code sont précédées d’une icône de terminal, les recherches d’une icône de globe, et la réflexion n’a que du texte. La durée du titre est le temps total de la réponse (recherche, réflexion, exécution et traitement des fichiers) ; pour les anciennes réponses, on additionne les durées des étapes et de la réflexion. Une réponse qui ne comporte que de la réflexion, sans autre étape, conserve sa ligne d’origine « Réflexion ».</li><li><strong>Contenu des étapes :</strong> une fois dépliée, chaque étape de code place le code dans une carte claire, surmontée de la mention « Python » et d’un bouton de copie ; le code est coloré selon la syntaxe et défile horizontalement s’il est trop long ; la sortie s’affiche sous la carte et les étapes en échec sont signalées en rouge. Une étape repliée n’affiche pas de flèche de déploiement ; la flèche n’apparaît qu’au survol du curseur, et pointe vers le bas une fois l’étape dépliée ; les appareils tactiles n’ayant pas d’état de survol, aucune flèche n’est affichée tant que l’étape est repliée. Les noms d’étape n’indiquent plus « N-ième fois ».</li><li><strong>Affichage en direct identique à l’enregistrement :</strong> la liste des étapes d’une réponse en cours et le panneau de traitement enregistré utilisent le même style, de sorte que ce que l’on voit correspond à ce qu’on retrouvera à la réouverture. Le dépliage et le repliage du panneau enregistré sont animés avec amorti et respectent le réglage système « Réduire les animations ».</li><li><strong>Explications entre les étapes :</strong> ce que le modèle dit avant d’exécuter du code s’affiche en texte ordinaire entre les étapes, et n’est plus mêlé à la réponse finale ; ces textes sont conservés avec la réponse. Une consigne est ajoutée aux instructions système : avant chaque appel d’un outil d’exécution, expliquer en une phrase ce qui va être fait et pourquoi. Les 400 premiers caractères au plus de chaque tour de réponse sont d’abord mis en attente pour déterminer s’il s’agit d’une explication ou de la réponse ; une réponse courte n’apparaît d’un coup qu’à la fin du tour, une réponse longue est diffusée comme d’habitude.</li><li><strong>Réflexion repliée par défaut :</strong> la réflexion en cours ne se déploie plus automatiquement, c’est à l’utilisateur de la déplier si nécessaire ; une réflexion déjà dépliée n’est pas refermée à l’arrivée de nouveau contenu. Il en va de même pour la ligne « Réflexion… » du mode Standard.</li><li><strong>Sources de recherche :</strong> pour les réponses qui utilisent Tavily ou la recherche intégrée de Gemini, le panneau de traitement affiche « N sites consultés », qui se déplie en petites icônes de site et noms de domaine. Un clic sur une source ouvre d’abord une fenêtre de confirmation, puis la source s’ouvre dans un nouvel onglet ; la fenêtre propose une case « Ne plus me le rappeler », dont le choix n’est mémorisé que sur cet appareil. Les petites icônes sont obtenues par le navigateur directement auprès du site (/favicon.ico) ; si elles sont introuvables, une icône de globe s’affiche. Seules les adresses http et https sont acceptées. Gemini renvoie des redirections Google ; le nom de domaine qu’il fournit est donc affiché.</li><li><strong>Gemini : recherche et exécution de Python simultanées :</strong> Gemini n’autorise pas la recherche intégrée et les outils de fonction dans une même requête, et revenait auparavant au mode Standard. Désormais, une recherche est d’abord effectuée seule et produit un court résumé, qui est ensuite remis comme référence au tour qui exécute Python. Pendant la recherche, la ligne de progression affiche « Recherche sur le web… », puis « N sites consultés » à la fin ; le temps de recherche est inclus dans le temps total ; si la recherche échoue, la réponse se poursuit normalement, simplement sans résumé.</li></ul>",
    "<strong>Autres améliorations</strong>",
    "<ul><li><strong>Retour visuel à l’appui :</strong> tous les contrôles cliquables s’enfoncent légèrement puis reviennent lorsqu’on appuie dessus, et les contrôles désactivés tremblent légèrement lorsqu’on appuie dessus ; les styles de survol ne s’appliquent que sur les appareils dotés d’un curseur.</li><li><strong>Indicateurs de traitement :</strong> les boutons qui nécessitent une attente (exportation, importation, importation de données cloud, connexion et opérations sur les images) affichent une icône tournante pendant le traitement.</li><li><strong>Fichiers :</strong> lorsqu’un bloc de fichier écrit à part par le modèle porte le même nom qu’un document produit par le système de design, une carte vide supplémentaire n’apparaît plus ; les blocs de fichier Word, PowerPoint, Excel et PDF dont le contenu est vide ne s’affichent plus comme cartes et ne produisent plus de fichiers vides.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>Les sources de recherche ne prennent en charge que Tavily et la recherche intégrée de Gemini ; les sources des recherches intégrées des autres fournisseurs ne sont pas analysées. Les sources de Gemini n’apparaissent qu’une fois la réponse terminée, et les redirections Google pourront cesser de fonctionner par la suite.</li><li>La recherche de Gemini n’est effectuée qu’une fois, au tout début ; le modèle ne peut plus chercher de lui-même en cours d’exécution du code.</li><li>Les explications entre les étapes dépendent du fait que le modèle les rédige conformément aux instructions.</li><li>« Ne plus me le rappeler » n’a pour l’instant aucun interrupteur de réglage permettant de le rétablir ; il faut effacer les données de ce site.</li><li>En mode Standard, les blocs de fichier vides écrits par le modèle lui-même ne sont pas couverts par cette mise à jour.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Le journal d’exécution gagne trois champs (temps total, sources de recherche et explications des étapes), enregistrés avec le message ; les appareils qui n’ont pas encore été mis à jour ignorent ces champs et affichent toujours les étapes dans l’ancien style. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.1.1": [
    "<strong>Notes de version de Noureon 17.1.1</strong>",
    "Cette version corrige des problèmes de zone de saisie, de sélecteur de modèle, de défilement de la conversation et d’affichage de la réflexion sur téléphone et iPhone, et ajuste l’en-tête de page.",
    "<strong>Corrections</strong>",
    "<ul><li><strong>Zone de saisie sur téléphone :</strong> elle passe sur deux lignes, la saisie en haut et les outils en bas, avec conservation du bouton de microphone ; le titre de la page des Paramètres est conservé, et en revenant des Paramètres le bouton de retour retrouve sa place d’origine.</li><li><strong>Sélecteur de modèle sur téléphone :</strong> sa position d’ouverture est alignée sur celle du sélecteur « Design », sa taille est fixe, et il ne change plus de taille ni ne tremble lors d’une recherche ou de l’ouverture et de la fermeture du clavier ; lors d’une fermeture depuis l’extérieur, la mise en surbrillance du bouton d’annulation est supprimée.</li><li><strong>Saisie vocale :</strong> la forme d’onde affichée pendant la dictée est agrandie.</li><li><strong>En-tête de page :</strong> il devient un bandeau fin de hauteur fixe, de couleur unie, sans ligne de séparation, sous le bord duquel les messages s’estompent ; sa hauteur ne change plus selon la présence ou non du bouton de discussion temporaire. Lors d’un changement de conversation, la conversation précédente s’estompe au lieu de changer brusquement.</li><li><strong>Défilement de la conversation (iPhone) :</strong> la colonne de conversation sur téléphone n’est plus un second conteneur de défilement ; un glissement qui commence au bas de la conversation reste sur la conversation et ne rebondit plus vers le bas. À l’ouverture d’une conversation, il n’y a plus de tremblement initial.</li><li><strong>Blocs de réflexion et de code (iPhone) :</strong> pendant la diffusion d’une réponse, ils défilent normalement pour la lecture, sans que le contenu soit déplacé sous le doigt ; lorsqu’on est arrêté en bas, on peut aussi glisser directement vers le haut, le cadre de défilement conservant 2 pixels à chaque extrémité. Le texte qui apparaît pendant la diffusion s’affiche en fondu enchaîné, sans flou.</li><li><strong>Affichage de la réflexion :</strong> en mode Avancé, lorsque l’on clique sur « Arrêter », la réflexion déjà produite est conservée et marquée « Réflexion interrompue », repliée par défaut ; en la dépliant de nouveau, on est amené au contenu le plus récent ; la réflexion continue d’être produite pendant que l’on lit plus haut ; la ligne de réflexion réagit dès le premier clic, il n’est plus nécessaire de cliquer plusieurs fois.</li><li><strong>Heure et copie des réponses :</strong> la ligne d’heure et de copie de chaque réponse est fixée tout à droite.</li><li><strong>Menu de couleur des bulles :</strong> correction d’un repli anormal du menu.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>Si le défilement pose encore problème sur iPhone, merci de joindre un enregistrement d’écran à votre signalement.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.1.0": [
    "<strong>Notes de version de Noureon 17.1.0</strong>",
    "Cette version repense le choix du modèle à côté de la zone de saisie, ajoute au conseil de modèles des groupes nommables, et améliore l’utilisation de la réflexion, de la saisie vocale et des notifications.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Sélecteur de modèle :</strong> le modèle unique et le conseil de modèles sont réunis en un seul bouton à côté de la zone de saisie et un seul panneau, à la place du menu de modèles de l’en-tête et du panneau du conseil ; en haut du panneau, on bascule entre « Un modèle » et « Conseil ». Le modèle unique devient une liste consultable et regroupée par entreprise, sans devoir descendre successivement dans le fournisseur, le niveau, l’entreprise et la catégorie ; chaque ligne en occupe deux, le prix et la description sont placés dans une info-bulle, et davantage de modèles sont visibles d’un coup.</li><li><strong>Récents :</strong> en tête de la liste des modèles uniques, et de celles des membres et du modèle de synthèse du conseil, s’affichent les trois modèles les plus récemment utilisés ; la liste est mise à jour lorsqu’on choisit un modèle ou envoie un message, le modèle en cours d’utilisation en fait toujours partie, et ces modèles restent également dans leur groupe d’entreprise d’origine.</li><li><strong>Groupes du conseil :</strong> jusqu’à cinq groupes peuvent être enregistrés, chacun avec un nom, des membres et un modèle de synthèse, appliqués d’un clic ; la sélection actuelle peut être enregistrée comme nouveau groupe, puis, dans la page de modification, renommée (20 caractères au plus), réaffectée à d’autres membres et à un autre modèle de synthèse, ou supprimée. Le mode Consensus ou Discussion ne fait pas partie d’un groupe. L’étiquette du conseil sur la zone de saisie n’indique plus que « Consensus » ou « Discussion ».</li><li><strong>Réflexion :</strong> elle quitte la liste des modèles pour devenir un bouton distinct à côté de la zone de saisie (le niveau actuel est affiché en gris) et un panneau étroit. Le réglage se fait par un curseur à crans : un point par niveau, un bouton rond plus haut que la piste, qui saute d’un cran à la fois pendant le glissement en affichant en direct le nom du niveau, et n’est enregistré qu’au relâchement ; on peut aussi l’utiliser avec les touches fléchées, Début et Fin, et les appareils qui prennent en charge les vibrations vibrent légèrement à chaque cran.</li><li><strong>Saisie vocale :</strong> après un clic sur le microphone, toute la ligne de la zone de saisie devient une barre de dictée : un « ＋ » estompé, une forme d’onde qui grandit selon le volume, ainsi qu’annuler (✕) et terminer (✓). À la fin, ✓ se transforme en icône tournante et le texte n’est ajouté à la suite du message qu’une fois la dictée terminée ; Entrée termine, Échap annule, Ctrl+Maj+D démarre ou termine. Le survol du microphone affiche une info-bulle et le raccourci dans la langue de l’interface. La saisie vocale de la fenêtre de recherche reste inchangée.</li><li><strong>Notifications en haut à droite :</strong> elles deviennent des cartes blanches à fine bordure, avec une petite icône distinguant succès, avertissement et erreur, avec éventuellement un bouton d’action et un bouton de fermeture ; trois au plus sont affichées en même temps, les autres sont mises en file d’attente, un message identique ne fait que mettre à jour celui qui existe, le compte à rebours est suspendu tant que le curseur s’y trouve, la durée d’affichage est de 3 à 6 secondes, et sur téléphone elles se collent au bord supérieur de l’écran. L’avertissement de recherche à l’ouverture du conseil de modèles est raccourci en une phrase, accompagnée d’un bouton « Activer la recherche ».</li><li><strong>Affichage de la réflexion :</strong> la réflexion en cours et terminée utilise le même style ; en mode Avancé, dès que le modèle commence à produire la réponse, la ligne de réflexion se termine et se replie, et le temps passé à réfléchir est enregistré. Les animations de repli et de dépliage, d’ouverture et de fermeture des panneaux et de changement de page sont ajustées en même temps et respectent le réglage système « Réduire les animations ».</li></ul>",
    "<strong>Autres améliorations</strong>",
    "<ul><li>Lorsqu’on bascule entre modèle unique et conseil, choisit un modèle ou enregistre un groupe, l’écran est d’abord mis à jour, et l’enregistrement ne commence qu’après l’affichage de l’écran, sans attendre l’écriture de toutes les conversations.</li><li>Le bouton « Design » de la zone de saisie précharge le sélecteur lorsque le navigateur est inactif ou que le curseur ou le doigt s’en approche ; le sélecteur n’est dessiné qu’une fois et conservé, les miniatures sont dessinées une à une pendant les temps morts, et une icône tournante s’affiche si elles n’ont pas eu le temps de se charger ; le panneau n’applique plus de flou d’arrière-plan.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>« Récents » suit l’ordre d’utilisation le plus récent et ne comptabilise pas le nombre d’utilisations.</li><li>Le prix et la description étant placés dans des info-bulles, ils ne sont pas visibles sur les appareils tactiles sans curseur.</li><li>La forme d’onde vocale nécessite l’autorisation du microphone, et le navigateur doit autoriser l’utilisation du microphone en même temps que la reconnaissance vocale ; sinon la forme d’onde ne fait que légèrement onduler, les autres fonctions n’étant pas affectées. Si Ctrl+Maj+D est utilisé par le navigateur, cliquez plutôt sur le microphone.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les réglages gagnent deux champs, « groupes du conseil » et « modèles récents », que les anciennes versions ignorent ; les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "17.0.0": [
    "<strong>Notes de version de Noureon 17.0.0</strong>",
    "Cette version permet aux réponses de l’IA de produire et de prévisualiser directement des fichiers Word, Excel, PowerPoint, PDF, etc., ajoute le mode de production « Avancé » qui exécute Python dans le navigateur, et propose l’affichage en direct de la réflexion, des étapes d’exécution et de la vérification visuelle automatique.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Fichiers téléchargeables :</strong> les fichiers des réponses de l’IA se présentent sous forme de cartes, qui peuvent être prévisualisées et téléchargées ; les fichiers multiples d’une même réponse peuvent être obtenus d’un coup avec « Tout télécharger (ZIP) ». Sont pris en charge les formats texte tels que Markdown, CSV, JSON et le code, ainsi que Word (docx), Excel (xlsx), PowerPoint (pptx) et PDF ; les fichiers HTML sont prévisualisés dans un bac à sable isolé. Sur iPhone, les navigateurs autres que Safari, comme Chrome, utilisent le menu de partage pour enregistrer les fichiers.</li><li><strong>PowerPoint :</strong> 17 mises en page, avec graphiques et tableaux natifs, icônes, notes de l’orateur, images importées et aperçu des diapositives ; selon le contenu, on peut utiliser le design adaptatif de l’IA ou imposer l’un des 20 modèles, qui est alors appliqué de force par le programme, seules les couleurs principale et secondaire pouvant être ajustées dans la conversation.</li><li><strong>Word et PDF :</strong> Word propose 9 modèles et le design adaptatif de l’IA, une page de couverture et l’intégration des polices, avec un aperçu par pages ; le PDF partage le même design que Word, toutes les polices sont intégrées après sous-ensemble (y compris chinois simplifié, japonais, coréen et emoji en noir et blanc), avec prise en charge des numéros de page du sommaire, des signets, des graphiques vectoriels, des formules mathématiques et de l’aperçu PDF.js.</li><li><strong>Excel :</strong> style fixe avec couleur principale réglable, politique de formules et valeurs en cache, volets figés, filtres et cellules fusionnées, avec prise en charge des graphiques natifs et de l’aperçu des feuilles (y compris les boutons de filtre).</li><li><strong>Menu « Design » :</strong> le bouton « Design » de la zone de saisie est divisé en deux pages, présentations et Word / PDF, et « Mode : Standard / Avancé » est ajouté. Les nouvelles conversations sont en mode Avancé par défaut, valeur modifiable dans les Paramètres.</li><li><strong>Vérification visuelle automatique :</strong> lorsqu’un modèle capable de voir les images a fini d’écrire une présentation, le programme convertit chaque page en image et la remet au modèle pour une passe de vérification ; si un problème est détecté, une nouvelle réponse contenant le fichier corrigé est ajoutée ; chaque fichier n’est vérifié qu’une seule fois, et la fonction peut être désactivée dans les Paramètres. La progression de la vérification s’affiche sur une ligne sous le message, peut être dépliée pour voir chaque étape, et peut aussi être arrêtée.</li><li><strong>Mode Avancé (Python) :</strong> le modèle peut exécuter, dans le navigateur, dans un bac à sable isolé (run.noureon.com), Python 3.14 avec des paquets tels que numpy, pandas, matplotlib, python-docx, python-pptx, openpyxl et reportlab, pour analyser les fichiers importés, calculer précisément des graphiques et produire des fichiers. La première utilisation nécessite le téléchargement d’environ 30 Mo. Les appels d’outils de Gemini et d’OpenRouter sont pris en charge ; si le modèle ne le prend pas en charge, si le navigateur ne le prend pas en charge, ou en cas d’utilisation du conseil de modèles ou du mode Apprentissage, le mode Standard est utilisé automatiquement, avec l’explication de la raison.</li><li><strong>Fichiers créés librement :</strong> en mode Avancé, c’est par défaut le modèle qui conçoit lui-même les fichiers Word, PowerPoint et PDF ; lorsqu’un modèle de design est choisi, ce type de fichier est confié au système de design. Le bac à sable intègre les polices Inter ainsi que Source Han Sans et Source Han Serif (chinois traditionnel et simplifié, japonais, coréen), et les fichiers Word et PowerPoint intègrent automatiquement les polices utilisées à la fin de la réponse. Des fichiers ne sont produits que lorsque l’utilisateur en demande ou en fournit ; l’écriture ordinaire et les questions-réponses reçoivent une réponse en texte.</li><li><strong>Conservation et aperçu des fichiers :</strong> les fichiers produits par Python sont conservés dans le message, et synchronisés, exportés et partagés avec la conversation ; des lecteurs maison pour xlsx et pptx permettent de prévisualiser les fichiers conçus librement, et d’autres fichiers tels que les images et les ZIP peuvent aussi être prévisualisés ou téléchargés. Lorsqu’un fichier manque sur l’appareil, « Relancer » permet de le restaurer. Les présentations conçues librement passent aussi par la vérification visuelle, et lorsqu’un problème est détecté, le modèle réexécute Python pour produire une version corrigée.</li><li><strong>Affichage du déroulement de l’exécution :</strong> dès le début de la réponse, le message affiche une liste d’étapes : réflexion, préparation de Python, code de chaque exécution, sortie en direct et fichiers produits (les images s’affichent en miniatures) ; les étapes en cours affichent un chronomètre et les étapes en échec conservent l’erreur. Les étapes terminées se replient sur une ligne ; le dépliage et le repliage ont une brève animation de transition et respectent le réglage système « Réduire les animations ».</li><li><strong>Affichage de la réflexion :</strong> dans toute conversation, dès que le modèle envoie de la réflexion, une réflexion dépliable s’affiche au-dessus de la réponse ; une fois terminée, elle est conservée sous le nom « Réflexion » ou « Résumé de la réflexion » et reste consultable après actualisation. La réflexion propre du modèle est désignée par « Réflexion » ; pour les modèles dont le fournisseur ne fournit qu’un résumé (comme Gemini et Claude), elle est désignée par « Résumé de la réflexion ». En lisant une réflexion plus ancienne, on n’est pas ramené de force au contenu le plus récent ; en cas d’arrêt avant l’apparition de la réponse, elle est conservée sous la mention « Réflexion interrompue » avec le contenu déjà produit. Les requêtes vers les modèles NVIDIA gagnent un paramètre de diffusion de la réflexion.</li></ul>",
    "<strong>Autres améliorations</strong>",
    "<ul><li>Lorsque la page était déjà ouverte avant le déploiement de la nouvelle version, l’échec du chargement des nouveaux fichiers affiche désormais « Noureon vient d’être mis à jour » avec un bouton de rechargement, au lieu de l’erreur brute du navigateur, et le rechargement ne se répète pas dans la minute.</li><li>Lors d’un clic sur « Arrêter », la réponse partielle déjà reçue est conservée ; lors d’un changement de conversation, la réponse en cours est conservée.</li><li>Le code des messages de conversation et de l’affichage du code source des fichiers est coloré selon le langage ; les catalogues de modèles NVIDIA et OpenRouter sont mis à jour ; DOMPurify passe à la version 3.4.13.</li></ul>",
    "<strong>Limites connues</strong>",
    "<ul><li>L’affichage de la réflexion dépend du fournisseur : Gemini et Claude ne fournissent qu’un résumé, les modèles de la série OpenAI ne fournissent pas le texte de la réflexion ; dans ces cas, un résumé est affiché, ou rien.</li><li>L’aperçu des PowerPoint conçus librement est dessiné approximativement par un lecteur maison ; les remplissages en dégradé des formes, les ombres et certains détails des graphiques diffèrent de PowerPoint, et c’est le fichier téléchargé qui fait foi.</li><li>Les modèles NVIDIA ne prennent actuellement pas en charge l’appel d’outils et n’utilisent pas le mode Avancé.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données. Les conversations contenant un journal d’exécution ou des fichiers sont synchronisées avec les autres appareils ; les appareils qui n’ont pas encore été mis à jour vers cette version affichent le journal d’exécution comme un bloc de texte brut et ne voient pas les fichiers produits par Python : mettez-les d’abord à jour. Les conversations, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "16.9.1": [
    "<strong>Notes de version de Noureon 16.9.1</strong>",
    "Cette version améliore l’action d’enregistrement des discussions temporaires sur ordinateur, afin d’éviter que la Chronologie, à droite, n’interfère avec le bouton de signet.",
    "<strong>Corrections</strong>",
    "<ul><li><strong>Action d’enregistrement :</strong> la zone en haut à droite contenant l’état de la discussion temporaire et le bouton de signet ne déclenche plus la Chronologie ; la discussion temporaire peut être enregistrée définitivement de manière fiable.</li><li><strong>Chronologie :</strong> sur ordinateur, la zone de survol du bord droit commence désormais sous la barre supérieure ; le mode d’ouverture habituel reste inchangé.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données ; les discussions normales, les discussions temporaires et les données de mémoire existantes ne sont pas affectées."
  ],
  "16.9.0": [
    "<strong>Notes de version de Noureon 16.9.0</strong>",
    "Cette version ajoute le mode de discussion temporaire, pouvant être converti à tout moment en discussion normale, avec un choix clair d’accès à la mémoire et des limites de confidentialité précises.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Discussion temporaire :</strong> accessible depuis le coin inférieur gauche de l’interface de chat ; le contenu temporaire n’apparaît ni dans l’historique des conversations, ni dans la recherche, l’exportation ou la synchronisation cloud, et ne crée aucun nouveau souvenir.</li><li><strong>Contrôle de la personnalisation :</strong> avant de commencer, l’utilisateur peut choisir de consulter la mémoire existante ou d’utiliser le mode non personnalisé, qui ignore la mémoire, les extensions et les instructions personnalisées.</li><li><strong>Enregistrement définitif :</strong> une fois la discussion commencée, elle peut être enregistrée définitivement depuis le coin inférieur gauche et se transforme alors, à la même place, en discussion normale ; le contenu antérieur à l’enregistrement n’est pas rétroactivement écrit dans la mémoire.</li><li><strong>État de l’interface :</strong> le mode temporaire affiche son état en haut à droite, l’indication centrale reprend l’emplacement du message d’accueil, et les commandes en bas à gauche ne se déplacent plus et ne masquent plus le contenu principal.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données ; les discussions normales, la mémoire et les données de synchronisation existantes ne sont pas affectées."
  ],
  "16.8.0": [
    "<strong>Notes de version de Noureon 16.8.0</strong>",
    "Cette version refond la zone de saisie et l’interaction avec les fonctions complémentaires sur ordinateur, et corrige la stabilité de la mise en page du menu des fonctions complémentaires sur mobile.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Zone de saisie :</strong> la largeur, l’espacement, les angles arrondis, l’ombre et la fine ligne du bord supérieur de la version pour ordinateur ont été ajustés ; le texte long s’étend vers le bas, avec une commande d’agrandissement au-delà de dix lignes, et les pièces jointes et badges de fonction ne déforment plus la zone de saisie.</li><li><strong>Fonctions complémentaires :</strong> l’appareil photo, l’image, le fichier, la recherche web, le Model Council et le Mode Apprentissage utilisent désormais six icônes PNG originales ; le menu sur ordinateur met en surbrillance l’élément survolé et, une fois déployé, masque le bouton placé tout en bas ; le menu sur mobile conserve également une disposition compacte.</li><li><strong>Fonctions en ligne :</strong> les badges de fonction pris en charge peuvent être insérés sur n’importe quelle ligne et à n’importe quelle position du curseur ; ils peuvent être sélectionnés, copiés et supprimés avec la touche Retour arrière comme du texte, et restent, après l’envoi, à la même hauteur que le texte du message.</li><li><strong>Stabilité :</strong> correction de deux problèmes : les fonctions complémentaires ne pouvaient plus être réactivées après l’envoi d’un message, et la sélection répétée de la même pièce jointe ne se déclenchait pas.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette mise à jour ne nécessite aucune migration de données ; les conversations, les pièces jointes et les paramètres de modèle existants ne sont pas affectés."
  ],
  "16.7.1": [
    "<strong>Notes de version de Noureon 16.7.1</strong>",
    "Cette version synchronise la dernière liste de modèles, les prix et les capacités multimodales de Gemini, OpenRouter et NVIDIA.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Mise à niveau de modèles :</strong> Gemini passe à 3.8 Flash ; Claude Fable passe à 5.1 ; OpenAI GPT-5.5 passe à GPT-6 Astra.</li><li><strong>Nouveaux modèles :</strong> OpenRouter ajoute Z.ai GLM 5.3 Flash ; NVIDIA passe à DeepSeek V4 Pro 0813 et Kimi K3.</li><li><strong>Capacités et prix :</strong> les niveaux de réflexion, la capacité d’entrée d’images et les prix sont mis à jour d’après les données officielles, et les descriptions de DeepSeek sont harmonisées avec un affichage concis des prix d’entrée/sortie.</li><li><strong>Simplification des modèles :</strong> Ox Alpha est retiré ; les sélections de modèle existantes reviennent en toute sécurité à une valeur de repli grâce au mécanisme de migration des paramètres.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Les paramètres existants de Gemini 3.7 Flash, Claude Fable 5, GPT-5.5 et des anciens modèles NVIDIA sont migrés automatiquement vers les nouveaux modèles correspondants."
  ],
  "16.7.0": [
    "<strong>Notes de version de Noureon 16.7.0</strong>",
    "Cette version ajuste l’affichage en flux continu et la stabilité de la mise en page du contenu des conversations, et corrige plusieurs problèmes liés aux formules mathématiques, aux graphiques, aux tableaux et aux actions sur les messages.",
    "<strong>Principales modifications</strong>",
    "<ul><li><strong>Formules mathématiques :</strong> correction de l’analyse des commandes KaTeX en environnement de production, des délimiteurs en ligne et du découpage sur plusieurs lignes des délimiteurs extensibles appariés ; les formules continuent d’être rendues en temps réel au fil du flux, avec un meilleur retour à la ligne et un défilement horizontal local pour les formules longues.</li><li><strong>Graphiques et tableaux :</strong> pendant la génération d’un graphique, le code source brut n’est plus affiché et est remplacé par un message d’état localisé, le graphique apparaissant dès que les données sont assez complètes pour être rendues ; pendant la génération d’un tableau, les reconstructions répétées à l’origine d’un scintillement sont évitées, et le DOM ainsi que l’état de défilement existants sont conservés une fois la génération terminée.</li><li><strong>Mise en page du chat :</strong> ajustement de l’espacement vertical entre les messages de l’utilisateur et les réponses de l’assistant, du rythme des titres et de l’usage des séparateurs, afin de réduire les coupures visuelles inutiles.</li><li><strong>Actions sur les messages et les médias :</strong> correction du masquage prématuré des boutons de copie et de modification des messages de l’utilisateur sur ordinateur lors du survol à la souris, et de l’image unique qui n’était pas alignée à droite sur mobile.</li></ul>",
    "<strong>Compatibilité</strong>",
    "Cette version ne modifie ni les données de conversation existantes, ni les données de compte, ni le format de synchronisation."
  ],
  "16.6.7": [
    "<strong>🚀 Noureon 16.6.7 : aperçu vidéo et mise à jour des modèles NVIDIA</strong>",
    "Cette mise à jour corrige les miniatures vidéo vides et la couleur du bouton de fermeture des médias, et synchronise le dernier modèle DeepSeek de NVIDIA.",
    "<strong>✨ Contenu de la mise à jour :</strong>",
    "<ul><li><strong>🎬 Miniatures vidéo :</strong> dans la zone de saisie et après l’envoi, le module vidéo extrait une image visible comme miniature, et utilise un fond sombre pendant le chargement.</li><li><strong>✕ Commandes des médias :</strong> la croix de suppression et de fermeture des aperçus d’images et de vidéos est désormais toujours affichée en blanc.</li><li><strong>🧠 Modèles NVIDIA :</strong> DeepSeek V4 Flash passe à DeepSeek V4 Flash 0731, qui prend en charge trois niveaux de réflexion (désactivé, élevé, maximal), avec migration automatique des paramètres de modèle existants.</li></ul>",
    "Noureon continuera d’améliorer l’expérience multimédia et la prise en charge des modèles."
  ],
  "16.6.6": [
    "<strong>🚀 Noureon 16.6.6 : nouveaux modèles de raisonnement visuel et de test Stealth</strong>",
    "Cette mise à jour ajoute les derniers modèles d’OpenRouter et introduit une confirmation des conditions lors de la première utilisation des modèles Stealth tiers.",
    "<strong>✨ Contenu de la mise à jour :</strong>",
    "<ul><li><strong>🧠 Nouveaux modèles :</strong> ajout de la version de test gratuite Ox Alpha, ainsi que de DeepSeek V4 Flash Vision Exp, qui prend en charge l’entrée d’images.</li><li><strong>🔐 Confirmation à la première utilisation :</strong> lors de la première sélection d’Ox Alpha, les Stealth Model Terms s’affichent ; après confirmation, l’état est enregistré et l’invite n’est plus répétée.</li><li><strong>🌍 Multilingue et données de capacités :</strong> synchronisation, pour les cinq langues de l’interface, de l’invite des conditions, des niveaux de réflexion, de la capacité d’entrée d’images et des derniers prix.</li></ul>",
    "Noureon continuera de mettre à jour la prise en charge des modèles et les mesures de protection des utilisateurs."
  ],
  "16.6.5": [
    "<strong>[Noureon 16.6.5 : mise à jour de la liste des modèles et de la prise en charge des fournisseurs]</strong>",
    "Cette mise à jour actualise les versions de modèles, les indications de capacités et les prix d’après les dernières données de l’API Google Gemini et d’OpenRouter, et simplifie l’intégration des fournisseurs.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>⚡ Nouvelle génération de modèles :</strong> Gemini passe à 3.7 Flash ; OpenRouter met à jour DeepSeek, Qwen et Grok, et ajoute les versions gratuites de GLM 5.3 et de Nemotron 3.5 Lightning.</li><li><strong>🧠 Synchronisation des données de capacités :</strong> mise à jour, d’après les données des fournisseurs, des niveaux de réflexion sélectionnables, de la prise en charge de l’entrée d’images, des prix des modèles et de l’ordre de publication.</li><li><strong>🧹 Simplification des fournisseurs :</strong> la liste NVIDIA ne conserve que les modèles DeepSeek, MoonshotAI, Step et Z.ai ; les modèles Xiaomi et l’intégration native du fournisseur Step Plan sont retirés.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.6.4": [
    "<strong>[Noureon 16.6.4 : une recherche mobile plus stable]</strong>",
    "Cette version corrective poursuit l’amélioration de la recherche de conversations sur mobile, afin de rendre l’affichage plus stable et l’utilisation plus nette à l’ouverture et à la fermeture du clavier à l’écran.",
    "<strong>✨ Points de correction :</strong>",
    "<ul><li><strong>⌨️ Basculement du clavier plus stable :</strong> la synchronisation de la zone visible du navigateur mobile est ajustée afin de réduire les sauts d’affichage, les retards et les brèves apparitions de l’arrière-plan du chat à l’ouverture et à la fermeture du clavier.</li><li><strong>📱 Commandes de recherche non masquées :</strong> la zone de saisie et la sélection du mode s’organisent en fonction de la zone visible, de sorte que les résultats de recherche restent consultables lorsque le clavier est ouvert.</li><li><strong>✨ Écran de repos plus épuré :</strong> la loupe et l’invite « Rechercher des conversations » au centre de la page de recherche mobile sont supprimées, afin d’éviter que ces éléments ne subissent de retard ou ne sautent lors du basculement du clavier.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.6.3": [
    "<strong>[Noureon 16.6.3 : une recherche de conversations plus intuitive et plus stable]</strong>",
    "Cette version corrective réorganise l’expérience de recherche de conversations, afin de retrouver plus rapidement le contenu recherché, sur ordinateur comme sur mobile.",
    "<strong>✨ Points de correction :</strong>",
    "<ul><li><strong>🔎 Trois modes de recherche :</strong> les trois modes (mot-clé du titre, mot-clé du contenu et langage naturel) sont conservés, et le mode actuellement sélectionné reprend les couleurs d’interface personnalisées par l’utilisateur.</li><li><strong>💬 Résultats plus clairs :</strong> la recherche ne liste que les conversations déjà présentes dans l’historique, utilise une icône de conversation unique et sobre, et supprime la surbrillance jaune, les niveaux de pertinence et les actions d’aperçu supplémentaires.</li><li><strong>🖥️ Version ordinateur remaniée :</strong> adoption d’une fenêtre de recherche centralisée ; la disposition de la zone de saisie, du changement de mode, de la saisie vocale et de la commande de fermeture est ajustée pour réduire les espaces inutiles.</li><li><strong>📱 Version mobile plus stable :</strong> utilisation d’une page de recherche blanche adaptée au tactile et au clavier à l’écran, afin de corriger le scintillement, les sauts, le masquage et l’invisibilité des résultats lors de la saisie.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.6.2": [
    "<strong>[Noureon 16.6.2 : des limites de sécurité et un champ d’action des Nouras plus clairs]</strong>",
    "Cette version corrective précise les limites de responsabilité des Nouras dans les conversations, tout en évitant que les instructions de personnalisation n’influencent les traitements en arrière-plan.",
    "<strong>✨ Points de correction :</strong>",
    "<ul><li><strong>🛡️ Avertissement lors de la création de Nouras à haut risque :</strong> lors de la création ou de la modification d’un Noura personnalisé touchant des domaines professionnels à haut risque tels que la médecine, la psychologie, le droit ou l’investissement, un avertissement s’affiche : le contenu n’a pas été validé par des professionnels et ne peut remplacer l’aide d’un professionnel qualifié ; l’utilisateur reste libre de décider de poursuivre la création.</li><li><strong>💬 Séparation des conversations et des tâches d’arrière-plan :</strong> les instructions d’un Noura ne s’appliquent qu’aux réponses visibles par l’utilisateur et aux discussions du Model Council ; elles n’interviennent pas dans les tâches d’arrière-plan telles que la recherche, la traduction des pièces jointes ou l’organisation de la mémoire, ce qui réduit les effets de personnalisation inattendus.</li><li><strong>🤝 Des Nouras de santé mentale plus sûrs :</strong> « Voyage intérieur » et « Accompagnement de l’esprit » sont explicitement définis comme une aide à l’information et à la mise en ordre des idées, et ne fournissent ni diagnostic, ni traitement, ni prescription, ni ajustement de médication ; en cas de danger imminent, ils encouragent en priorité à contacter les services d’urgence locaux ou une personne de confiance.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.6.1": [
    "<strong>[Noureon 16.6.1 : une réparation automatique plus complète de l’index inter-conversations]</strong>",
    "Cette version corrective complète la réparation automatique de l’index des médias et rend plus compréhensible la progression de l’indexation en arrière-plan.",
    "<strong>✨ Points de correction :</strong>",
    "<ul><li><strong>🖼️ Complétion automatique de l’index des médias :</strong> lorsque l’index local d’images, de fichiers audio, de vidéos ou de documents existants est manquant, la vérification en arrière-plan le reconstitue directement à partir des résumés de médias et des pièces jointes enregistrés, sans qu’il soit nécessaire de lancer d’abord une vérification manuelle puis une optimisation.</li><li><strong>🔎 Progression de l’index plus claire :</strong> le traitement en arrière-plan s’affiche désormais comme « Vérifier l’index local » et distingue le nombre d’éléments réparés, déjà présents et en échec, afin que l’analyse par segments ne donne plus l’impression que tout l’index est reconstruit à chaque fois.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.6.0": [
    "<strong>[Noureon 16.6.0 : recherche automatique, mémoire vivante et rappel inter-conversations plus fiable]</strong>",
    "Cette version rend la recherche web plus prévisible et la mémoire inter-conversations plus transparente et plus stable ; la PWA installée peut désormais pivoter naturellement avec l’appareil.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>🌐 Recherche web automatique mieux maîtrisée :</strong> la recherche n’est activée automatiquement que pour la question en cours qui nécessite explicitement des informations externes récentes ; l’activation manuelle continue de s’appliquer à la conversation en cours et n’est pas modifiée par la détection automatique.</li><li><strong>🧠 Une mémoire plus vivante et plus transparente :</strong> ajout de résumés de mémoire synchronisables ; lorsqu’une réponse s’appuie sur d’anciennes conversations, des sources dépliables sont affichées et permettent de revenir à la conversation d’origine pour vérifier le contenu. Lorsqu’une ancienne réponse est demandée avec précision, le système retrouve en priorité le contenu d’origine et les détails essentiels.</li><li><strong>🛡️ Rappel local plus fiable :</strong> correction du problème de perte ou d’obsolescence possible de l’index de l’historique lors d’une actualisation, d’une synchronisation ou d’un déplacement vers la corbeille, et ajout d’un mécanisme de récupération sécurisée et de protection du dernier index valide.</li><li><strong>📱 Rotation libre de la PWA :</strong> Noureon installé peut basculer naturellement entre les orientations portrait et paysage sur téléphone et tablette, tout en conservant l’état du chat et des opérations essentielles.</li><li><strong>✨ Des conversations plus stables :</strong> correction du scintillement de toute la page à la fin de la réponse du modèle, et amélioration de l’affichage lors du changement de modèle et de la citation de réponses antérieures.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.5.0": [
    "<strong>[Noureon 16.5.0 : un espace de travail plus fiable, une mémoire plus intelligente et des outils de création plus complets]</strong>",
    "Cette version officielle regroupe les récentes améliorations des capacités essentielles : l’espace de travail cloud adopte un processus de synchronisation plus sûr et récupérable ; le système de mémoire offre une gestion plus claire et un consentement au rappel inter-conversations ; les fonctions de création, d’images et de présentation des données sont également étendues.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>☁️ Synchronisation cloud plus sûre :</strong> ajout des mises à jour en temps réel de l’espace de travail, de la synchronisation incrémentielle, du chargement des ressources à la demande, des sauvegardes de récupération et de la suppression sécurisée, afin de réduire les conflits de synchronisation entre appareils et les risques de perte accidentelle.</li><li><strong>🧠 Mémoire et rappel améliorés :</strong> renforcement de la vérification de la mémoire personnelle, de la gestion des conflits, des résumés par thème, de la mémoire des médias et de l’index local de l’historique ; le rappel inter-conversations est désormais consenti séparément pour chaque appareil.</li><li><strong>🎨 Création d’images et de contenus :</strong> ajout de la génération d’images via OpenRouter et Step Plan, de la poursuite des modifications sur l’image générée le plus récemment, de la modification de zones précises et de graphiques interactifs dans les messages.</li><li><strong>💬 Conversations plus efficaces :</strong> prise en charge de la modification des messages déjà envoyés, des questions de suivi par citation, du Mode Apprentissage et des règles de combinaison avec un Noura, et amélioration de la fluidité des réponses du Model Council et de l’interface de chat.</li><li><strong>🔐 Confidentialité et protection du compte :</strong> ajout d’un processus sécurisé de récupération du mot de passe, du masquage des clés API et de la séparation des paramètres sensibles ; les informations sensibles sont également mieux protégées lors de l’exportation des données.</li><li><strong>🌍 Interface et modèles :</strong> ajout des interfaces en russe et en espagnol, de la personnalisation des dossiers, de l’ordre des modèles et de la liste des modèles sélectionnables ; plusieurs modèles et l’expérience d’utilisation sur mobile sont aussi mis à jour.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.4.5": [
    "<strong>[Gemini 3.0 Flash disponible et ajustement de la liste des modèles]</strong>",
    "Cette mise à jour ajoute Google Gemini 3.0 Flash Preview et réorganise la liste des modèles : les anciens modèles de la série Gemini 2.5 sont retirés et plusieurs modèles au bon rapport qualité-prix sont ajoutés.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>⚡ Mise à jour de Gemini :</strong> ajout de <strong>Gemini 3.0 Flash Preview</strong> (pris en charge en natif par Google et via OpenRouter), avec entrée d’images. Les anciens modèles Gemini 2.5 Pro, Flash et Flash-Lite sont retirés en parallèle.</li><li><strong>🌟 Nouveaux modèles :</strong> ajout d’OpenRouter <strong>Xiaomi Mimo V2 Flash</strong> (gratuit) et de <strong>Minimax M2.1</strong>.</li><li><strong>💻 Mise à jour des modèles de code :</strong> ajout d’<strong>OpenAI GPT-5.2 Codex</strong> (avec entrée d’images), qui remplace GPT-5.1 Codex.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.4.4": [
    "<strong>[Ajout de la série GPT-5.2 et ajustement de la liste des modèles]</strong>",
    "Cette mise à jour ajoute la série OpenAI GPT-5.2, retire d’anciens modèles et ajuste les tarifs de la série Qwen.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>🚀 Mise à jour des modèles :</strong> ajout d’<strong>OpenAI GPT-5.2</strong> et de <strong>GPT-5.2 Pro</strong>. Les anciens modèles GPT-5.1, GPT-4.1 et Grok 4 Fast sont retirés en parallèle.</li><li><strong>⚖️ Ajustement des tarifs :</strong> les tarifs de <strong>Qwen 3 Next 80B</strong> et de <strong>Qwen 3 Coder Exact</strong> ont été mis à jour ; veuillez consulter la liste des modèles pour connaître les prix les plus récents.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.4.3": [
    "<strong>[Ajout d’un modèle de programmation gratuit et ajustement du tarif de Grok]</strong>",
    "Cette mise à jour ajoute le modèle de programmation gratuit Mistral Devstral 2512 et applique à Grok 4.1 Fast son tarif officiel.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>💻 Modèle de programmation gratuit :</strong> ajout de <strong>Mistral Devstral 2512</strong>, destiné à la génération de code et aux questions techniques, en utilisation gratuite.</li><li><strong>💰 Mise à jour des tarifs :</strong> <strong>Grok 4.1 Fast</strong> met fin à sa gratuité temporaire et passe à son tarif officiel (entrée 0,20 $ / sortie 0,50 $) ; l’ancien canal gratuit est supprimé afin de garantir la stabilité du service.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.4.2": [
    "<strong>[Ajout d’un modèle de vision gratuit]</strong>",
    "Cette mise à jour ajoute Amazon Nova 2 Lite et DeepSeek V3.2.",
    "<strong>✨ Points clés :</strong>",
    "<ul><li><strong>👁️ Modèle de vision gratuit :</strong> ajout d’<strong>Amazon Nova 2 Lite</strong>, avec entrée d’images, en utilisation gratuite.</li><li><strong>🧠 Modèle de texte :</strong> ajout de <strong>DeepSeek V3.2</strong>, à tarif réduit et doté de capacités de raisonnement.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.4.1": [
    "<strong>[Réorganisation de la base de modèles : ajout de modèles de vision et de code]</strong>",
    "La version 16.4.1 réorganise la base de modèles, ajoute des modèles de développement et de reconnaissance visuelle haut de gamme, ajuste le prix de certains modèles et retire les options obsolètes.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>🚀 Nouveaux modèles :</strong> ajout d’<strong>OpenAI GPT-5.1 Codex</strong> et de <strong>Claude 4.5 Opus</strong>, tous deux avec entrée d’images ; ajout également de <strong>Qwen3 Next 80B</strong> et de <strong>Qwen3 VL 30B</strong>.</li><li><strong>💰 Ajustement des prix :</strong> le tarif d’utilisation de <strong>Qwen3 235B</strong> est réduit (à 0,07 $/0,46 $), et le modèle gratuit <strong>TNG R1T Chimera</strong> est ajouté.</li><li><strong>🧹 Nettoyage de la liste :</strong> retrait des anciens modèles et des doublons (tels que GPT-oss, la série Nano, les anciens Qwen VL, etc.), et mise à jour des informations de prix de Gemini 2.5 Flash Lite Preview.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.4.0": [
    "<strong>[Synchronisation P2P entre appareils]</strong>",
    "La version 16.4.0 ajoute la fonction « Synchronisation P2P entre appareils », qui permet de transférer des données d’un appareil à l’autre sans créer de compte et sans stockage sur un serveur cloud.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>📲 Synchronisation P2P entre appareils (Peer-to-Peer Sync) :</strong> connexion directe entre appareils grâce à la technologie WebRTC. L’ancien appareil génère un QR Code ; une fois celui-ci scanné avec l’appareil photo du nouvel appareil, l’historique des conversations, les paramètres et les Nouras sont synchronisés.</li><li><strong>🔒 Protection de la vie privée :</strong> l’historique de chat est transmis directement, de bout en bout, par un canal chiffré, sans être stocké sur aucun serveur tiers.</li><li><strong>⚡ Mode d’emploi :</strong> disponible dans « Paramètres > Gestion des Données » ; aucune sauvegarde par exportation puis importation n’est nécessaire, et le transfert de données fonctionne entre plateformes (téléphone / ordinateur).</li></ul>",
    "L’équipe Noureon"
  ],
  "16.3.0": [
    "<strong>[Ajustement de l’interface en plein écran]</strong>",
    "La version 16.3.0 ajuste l’interface des fenêtres des fonctions essentielles afin d’améliorer l’expérience d’utilisation sur appareil mobile.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>📱 Mode plein écran (Full Screen Mode) :</strong> la « page des paramètres », la « recherche dans l’historique des messages » et le « Tableau de Bord des Données » s’affichent désormais en plein écran.<ul><li><strong>Zone d’affichage agrandie :</strong> les marges de la fenêtre et la limite de largeur maximale sont supprimées ; le contenu remplit tout l’écran, ce qui permet d’afficher davantage d’informations lors de la consultation des graphiques de données ou du réglage de nombreux paramètres, avec moins de défilement.</li><li><strong>Expérience sur appareil mobile :</strong> amélioration de l’utilisation sur téléphone ; la fenêtre flottante d’origine est remplacée, pour une expérience proche de celle d’une application native.</li></ul></li><li><strong>🎨 Conception visuelle :</strong> en accord avec la mise en page plein écran, les angles arrondis (Rounded Borders) de la fenêtre et les espaces extérieurs sont supprimés.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.2.0": [
    "<strong>[Compression des sauvegardes et optimisation des performances]</strong>",
    "La version 16.2.0 ajoute un mécanisme de compression des sauvegardes et corrige des problèmes d’interface.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>📦 Compression des sauvegardes (prise en charge du ZIP) :</strong> lors de l’exportation des données, le système les regroupe automatiquement au format <code>.zip</code>.<ul><li><strong>Compression des images :</strong> les images trop volumineuses sont automatiquement redimensionnées à 1920px et converties au format JPEG, ce qui réduit la taille des fichiers (jusqu’à 90 %) tout en préservant la netteté visuelle.</li><li><strong>Structure des fichiers :</strong> les images et les autres pièces jointes (telles que PDF, TXT) sont stockées respectivement dans les dossiers <code>images/</code> et <code>files/</code>.</li></ul></li><li><strong>🔄 Rétrocompatibilité :</strong> la fonction d’importation reconnaît les nouvelles sauvegardes <code>.zip</code> et prend en charge les anciens fichiers <code>.json</code> exportés précédemment.</li><li><strong>🛠️ Correction de l’interface :</strong> correction du problème où, après l’importation directe d’un historique depuis la page de connexion, l’ancien écran de connexion pouvait subsister et bloquer le défilement ou les clics.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.1.1": [
    "<strong>[Ajout de modèles de vision et de la catégorie de génération d’images]</strong>",
    "La version 16.1.1 ajoute un modèle gratuit doté de capacités visuelles et intègre en avance l’interface de la catégorie de génération d’images.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>🚀 Modèle de vision gratuit Grok :</strong> ajout de <code>x-ai/grok-4.1-fast:free</code>, avec entrée d’images, en utilisation gratuite.</li><li><strong>🍌 Catégorie de génération d’images :</strong> ajout de la catégorie « Génération d’images » et mise en place anticipée de deux options de modèle, <strong>Nano banana pro🍌</strong> et <strong>Nano banana🍌</strong>.</li><li><strong>🚧 Remarques :</strong> pour le moment, les modèles de la série Nano banana ne proposent que des <strong>options d’interface</strong> ; la fonction de génération d’images n’est pas encore ouverte, et ces modèles ne permettent donc pas encore de produire des images ; elle sera proposée dans une version ultérieure.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.1.0": [
    "<strong>[Expérience sur appareil mobile et ajustements visuels]</strong>",
    "La version 16.1.0 ajuste l’expérience sur appareil mobile et des détails de l’interface, afin de garantir la cohérence des fonctions entre plateformes.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>📱 Correction de l’envoi de fichiers OpenRouter sur mobile :</strong> correction de la logique de filtrage du menu inférieur sur mobile. Avec un modèle OpenRouter (tel que Claude ou GPT-4), le menu déroulant du téléphone affiche désormais correctement le bouton « 📁 Fichier ».</li><li><strong>👀 Abréviation des noms de fichiers :</strong> les noms de fichiers trop longs sont tronqués visuellement dans les bulles de conversation (cinq premiers caractères + ...). Il s’agit d’un ajustement d’affichage : le modèle d’IA reçoit toujours le nom de fichier complet.</li><li><strong>⚡ Stabilité :</strong> optimisation de la détermination de l’état des boutons lors du passage entre Gemini et OpenRouter.</li></ul>",
    "L’équipe Noureon"
  ],
  "16.0.0": [
    "<strong>[Prise en charge des fichiers par OpenRouter et mise à niveau de la couche sous-jacente]</strong>",
    "La version 16.0.0 permet aux modèles accessibles via OpenRouter de lire des fichiers, et d’analyser des rapports PDF et des images.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>📁 Prise en charge des fichiers par OpenRouter :</strong> il est possible d’envoyer des documents PDF ou des images aux modèles OpenRouter compatibles. Le système intègre un moteur d’analyse de fichiers qui permet à ces modèles de lire et d’analyser le contenu des documents envoyés, sans se limiter aux modèles Gemini.</li><li><strong>🔧 Compatibilité entre deux plateformes :</strong> pour gérer les différences de format de données entre plateformes, la logique sous-jacente de transmission des fichiers a été refondue. Le système adapte le format selon le modèle cible : pour OpenRouter, il transmet des informations complètes incluant le nom du fichier afin de faciliter l’analyse ; pour Gemini, il organise automatiquement le format des données, ce qui résout les erreurs de transmission entre les deux plateformes.</li><li><strong>🎨 Interface adaptée au modèle :</strong> le menu des pièces jointes affiche ou masque automatiquement les boutons d’envoi correspondants selon les capacités du modèle sélectionné (prise en charge ou non de la vision, prise en charge ou non des documents).</li></ul>",
    "Cette mise à jour étend le champ du traitement des fichiers de Noureon, qui n’est plus limité à un seul fournisseur de modèles.<br><br>L’équipe Noureon"
  ],
  "15.10.3": [
    "<strong>[Tableaux intelligents et mise à jour des modèles]</strong>",
    "La version 15.10.3 améliore la lecture des tableaux sur appareil mobile et met à jour les options de modèles.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>📊 Défilement des tableaux :</strong> lorsque l’IA génère un tableau large, une barre de défilement horizontale interne apparaît automatiquement ; la largeur de la bulle de conversation reste inchangée et il est possible de balayer à gauche et à droite dans la bulle pour consulter l’intégralité du tableau, sans déformation de la mise en page.</li><li><strong>👆 Prévention des gestes involontaires sur mobile :</strong> lorsque l’on balaie dans un tableau, le geste d’ouverture de la barre latérale est temporairement désactivé, afin d’éviter l’ouverture accidentelle de la barre latérale.</li><li><strong>🤖 Ajustement de la bibliothèque de modèles :</strong> ajout de <strong>x-ai/grok-4.1-fast</strong> (avec entrée d’images, gratuit pour une durée limitée) ; retrait des modèles de test de la série Sherlock.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.10.2": [
    "<strong>[Mise à jour de la personnalisation des dossiers]</strong>",
    "La version 15.10.2 refond le système de personnalisation des dossiers, en remplaçant les émojis par des icônes SVG au trait.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>🎨 Icônes SVG au trait :</strong> les icônes en émojis sont remplacées par des icônes SVG au style épuré (formes de dossier, de nuage, d’étiquette, etc.).</li><li><strong>🖌️ Couleurs indépendantes :</strong> la « couleur du trait de l’icône » et la « couleur de l’étiquette de texte » peuvent désormais être définies séparément (trois couleurs au choix : noir, blanc, gris).</li><li><strong>📱 Ajustements sur mobile :</strong> nouvelle conception de l’icône du menu d’actions sur mobile (un curseur représente « Personnaliser ») ; correction de la mise en page de la fenêtre de personnalisation et du chevauchement des icônes.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.10.1": [
    "<strong>[Mise à jour de la bibliothèque de modèles : ajout de modèles expérimentaux et simplification de la liste]</strong>",
    "La version 15.10.1 ajoute deux modèles de test gratuits fournis par OpenRouter et retire certains modèles.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>🚀 Nouveaux modèles expérimentaux :</strong> ajout de deux modèles de test Alpha, actuellement gratuits, tous deux avec entrée d’images :<ul style='margin-left: 20px; margin-top: 5px;'><li><strong>Sherlock Dash Alpha :</strong> conçu pour des questions-réponses et une exécution de tâches rapides et directes.</li><li><strong>Sherlock Think Alpha :</strong> conçu pour les tâches complexes qui exigent une réflexion approfondie, du raisonnement et de la planification.</li></ul></li><li><strong>🧹 Simplification de la liste des modèles :</strong> retrait du modèle <strong>Minimax M2</strong>.</li></ul>",
    "Noureon continuera d’évaluer et d’ajouter des modèles. Les modèles de test peuvent être essayés, et des commentaires peuvent être transmis.<br><br>L’équipe Noureon"
  ],
  "15.10.0": [
    "<strong>[Noureon prend en charge l’installation en PWA]</strong>",
    "La version 15.10.0 fait de Noureon une application web progressive (PWA), pour une expérience d’utilisation plus proche d’une application native.",
    "<strong>✨ Points clés de cette mise à jour :</strong>",
    "<ul><li><strong>Installation sur le bureau / l’écran d’accueil :</strong> Noureon peut être installé sur le bureau d’un ordinateur ou sur l’écran d’accueil d’un téléphone, pour un lancement en un clic. Cliquez sur l’icône d’installation dans la barre d’adresse du navigateur.</li><li><strong>Accès hors ligne :</strong> lorsque le réseau est instable ou absent, l’interface de base de l’application peut toujours se charger et l’historique est consultable.</li><li><strong>Fenêtre indépendante :</strong> après un lancement depuis l’icône du bureau, Noureon s’exécute dans une fenêtre indépendante, sans la barre d’adresse ni les boutons du navigateur.</li><li><strong>Vitesse de chargement :</strong> grâce à la technique de mise en cache, le démarrage et le chargement sont plus rapides après la première visite.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.9.1": [
    "<strong>[Mise à jour de la bibliothèque de modèles et optimisation des performances]</strong>",
    "La version 15.9.1 met à jour la bibliothèque de modèles essentielle et ajuste l’architecture sous-jacente :",
    "<strong>Mise à jour des modèles :</strong>",
    "<ul><li><strong>Ajout du modèle OpenAI GPT-5.1 :</strong> introduction de GPT-5.1 d’OpenAI.</li><li><strong>Nettoyage de la bibliothèque de modèles :</strong> retrait du modèle de test <code>Polaris Alpha</code> et de l’ancien <code>GPT-5</code>, remplacé par GPT-5.1.</li></ul>",
    "<strong>Stabilité et optimisation de l’expérience :</strong>",
    "<ul><li><strong>Ajustement de l’architecture back-end :</strong> les services back-end sont ajustés pour prendre en charge les nouveaux modèles et améliorer les performances globales.</li><li><strong>Retouches de l’interface :</strong> correction de problèmes d’affichage des styles dans certaines parties de l’interface dans des cas particuliers, pour une meilleure cohérence visuelle.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.9.0": [
    "<strong>[Simplification des fonctions essentielles et optimisation de l’expérience]</strong>",
    "La version 15.9.0 ajuste les fonctions essentielles et l’interface :",
    "<ul><li><strong>Suppression de la mémoire inter-conversations (type 2) :</strong> afin que les réponses de l’IA soient plus ciblées et prévisibles, la fonction de « mémoire inter-conversations » est supprimée. La mémoire de l’IA ne comprend plus que la <strong>« mémoire des habitudes personnelles (type 1) »</strong> explicitement définie par l’utilisateur et le contexte de la conversation en cours. Cet ajustement simplifie les options de paramétrage et rend le comportement de l’IA plus stable et plus cohérent.</li><li><strong>Correction de la mise en page de la gestion de la mémoire :</strong> correction du problème où, dans « Paramètres > Gestion de la Mémoire », le contenu trop long d’un seul souvenir personnalisé élargissait la fenêtre des paramètres et désorganisait la mise en page. Le texte passe désormais automatiquement à la ligne.</li></ul>",
    "<strong>[Précisions]</strong>",
    "Cette mise à jour se concentre sur l’ajustement et la simplification des fonctions essentielles, afin de rendre la gestion de la mémoire plus simple et plus fiable.",
    "L’équipe Noureon"
  ],
  "15.8.1": [
    "<strong>[Vitesse d’affichage et ajustements de l’interface]</strong>",
    "La version 15.8.1 améliore la vitesse d’affichage des messages et des détails de l’interface :",
    "<ul><li><strong>Nouveau moteur d’affichage en flux continu :</strong> réécriture de la manière d’afficher les messages. La nouvelle technique de « rendu synchronisé sur les images » reflète la vitesse de sortie d’origine du modèle et élimine le décalage « le modèle a fini de produire sa sortie, mais le texte continue de s’afficher caractère par caractère ». Le retard de rattrapage du rendu du texte est <strong>ramené d’une moyenne de 2 400 millisecondes à 140 millisecondes</strong>.</li><li><strong>Simplification du fonctionnement :</strong> à la suite des retours des utilisateurs, le mécanisme de double confirmation « deux clics pour envoyer » est supprimé ; chaque clic envoie désormais directement le message.</li></ul>",
    "<strong>[Ajustements de l’interface et correction des animations]</strong>",
    "Les détails de l’interface sont ajustés comme suit :",
    "<ul><li><strong>Animation de la zone de saisie adaptative :</strong> correction de la transition d’animation peu fluide de la zone de saisie lors du passage entre la forme « ovale » et la forme « rectangle à angles arrondis ».</li><li><strong>Correction de la mise en page :</strong> correction du problème où les badges de fonction complémentaire ou les boutons de la zone de saisie ovale dépassaient du bord ; une conception à angles arrondis adaptatifs est adoptée, de sorte que tous les éléments tiennent dans la zone de saisie dans tous les états.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.8.0": [
    "<strong>[Refonte de la fonction de questions de suivi]</strong>",
    "La version 15.8.0 refond la fonction de « questions de suivi » :",
    "<ul><li><strong>Panneau flottant :</strong> les suggestions de questions de suivi s’affichent dans un panneau flottant en haut de l’écran. Un clic sur le bouton « ampoule d’inspiration » en haut à droite fait apparaître les suggestions, sans avoir à faire défiler pour les chercher.</li><li><strong>Appareil mobile :</strong> sur téléphone, les options de questions de suivi passent en mode « cartes à balayer » : il suffit de balayer à gauche et à droite pour les parcourir, ce qui économise de l’espace d’écran et résout le conflit de gestes avec la barre latérale.</li></ul>",
    "<strong>[Ajustements de l’interface et corrections de stabilité]</strong>",
    "Les ajustements de l’interface sont les suivants :",
    "<ul><li><strong>Champ de vision du chat :</strong> suppression des séparateurs entre les blocs de la barre latérale, réduction des espacements et affinement de la barre de titre supérieure sur ordinateur, afin de réserver davantage d’espace à la conversation.</li><li><strong>Stabilité des opérations :</strong> correction du bouton « Faire défiler vers le bas » qui sautait de haut en bas lors de certaines opérations, et suppression du bouton « Nouveau Chat » en double.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.7.12": [
    "<strong>[Optimisation du processus de démarrage]</strong>",
    "Cette mise à jour optimise le processus de chargement et améliore le comportement au démarrage et lors de l’actualisation :",
    "<ul><li><strong>[Correction de l’expérience]</strong> après l’actualisation de la page, l’état de connexion est conservé et il n’est plus nécessaire de se reconnecter.</li><li><strong>[Correction visuelle]</strong> correction du problème où le nom du modèle, au-dessus du chat, s’affichait avec retard au démarrage ou lors de l’actualisation.</li><li><strong>[Correction visuelle]</strong> correction du problème où la couleur des boutons principaux, comme le bouton d’envoi, clignotait d’abord en bleu par défaut pendant le chargement avant de prendre la couleur personnalisée.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.7.11": [
    "<strong>[Mise à jour de la bibliothèque de modèles] Ajout d’un modèle de test</strong>",
    "Cette mise à jour ajoute un modèle de test gratuit :",
    "<ul><li><strong>[Ajout]</strong> ajout du modèle <strong>Polaris Alpha (free)</strong> d’OpenRouter, sélectionnable dans la catégorie « Modèles Bêta » du sélecteur de modèles.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.7.10": [
    "<strong>[Mise à jour de la bibliothèque de modèles]</strong>",
    "Le contenu de cette mise à jour est le suivant :",
    "<ul><li><strong>[Ajout]</strong> ajout du modèle <strong>Kimi K2 Thinking</strong> de Moonshot AI, adapté à l’analyse approfondie et au raisonnement complexe.</li><li><strong>[Simplification]</strong> retrait de <code>Deepseek V3.1 Chat</code>, <code>Qwen3 235B</code> et <code>Llama 3.3 70B Instruct</code>.</li></ul>",
    "L’équipe Noureon"
  ],
  "15.7.9": [
    "<strong>[Extension de la bibliothèque de modèles]</strong>Ajout de deux modèles prenant en charge l’entrée d’images :",
    "<ul><li><strong>Ajout d’un modèle de vision gratuit (NVIDIA Nemotron) :</strong> introduction du modèle multimodal gratuit de NVIDIA, qui prend en charge la compréhension et l’analyse d’images.</li><li><strong>Ajout d’un modèle de vision haut de gamme (Qwen 2.5 VL) :</strong> ajout du grand modèle de vision-langage de Qwen (Tongyi Qianwen), adapté aux situations qui exigent une analyse d’image approfondie.</li></ul>",
    "<strong>[Optimisation de la bibliothèque de modèles]</strong>Retrait du modèle de phase de test <code>Andromeda Alpha</code>.",
    "L’équipe Noureon"
  ],
  "15.7.8": [
    "<strong>[Ajustement de la mise en page de l’interface principale]</strong> Le « sélecteur de modèle » est déplacé du coin supérieur droit vers le haut du chat, à la place du titre de la conversation. Le changement de modèle est plus direct et le champ de vision du chat plus épuré.",
    "<strong>[Nouvelle conception du haut de la barre latérale]</strong> À la suite des suggestions des utilisateurs, le haut de la barre latérale gauche est redessiné :",
    "<ul><li><strong>Recherche en priorité :</strong> la fonction « Rechercher » est présentée sous la forme d’un champ de recherche plus large, pour retrouver plus facilement les conversations de l’historique.</li><li><strong>Équilibre de la mise en page :</strong> « Nouveau Chat » et « Sélection Multiple » deviennent des boutons à icône indépendants.</li></ul>",
    "<strong>[Corrections de détails et d’expérience]</strong>Ajustement de détails d’interaction de l’interface :",
    "<ul><li><strong>Alignement du positionnement :</strong> correction du positionnement de la fenêtre de sélection de modèle, qui s’ouvre désormais à partir du texte du nom du modèle et non plus collée au bord de l’écran.</li><li><strong>Correction du défilement :</strong> correction du problème où la fenêtre de sélection de modèle pouvait ne plus défiler ou afficher un espace blanc superflu lors du passage d’une liste longue à une liste courte.</li></ul>",
    "<strong>[Ajustement de l’espace visuel]</strong>La largeur d’ouverture par défaut des barres latérales gauche et droite est légèrement augmentée, pour faciliter la consultation de la liste des conversations et de la Chronologie.",
    "L’équipe Noureon"
  ],
  "15.7.7": [
    "<strong>[Extension de la bibliothèque de modèles] Ajout de trois modèles de la série Qwen3</strong> Trois nouveaux modèles Qwen sont désormais disponibles via OpenRouter.",
    "<strong>[Capacité de vision] Ajout de Qwen3 VL 8B Instruct :</strong> ce modèle de vision léger offre une capacité de reconnaissance d’images et se distingue parmi les modèles de même catégorie, <strong>avec de meilleures performances que Gemini 2.5 Flash Lite et GPT-5 Nano</strong>.",
    "<strong>[Ajout de deux modèles de version 2507]</strong> <strong>`Qwen3 235B (2507)`</strong> et <strong>`Qwen3 235B Thinking (2507)`</strong>, optimisé pour la réflexion approfondie, dont les performances sont <strong>nettement supérieures</strong> à celles de la version précédente.",
    "<strong>[Mise à jour et corrections en arrière-plan]</strong>Intégration des nouveaux modèles ci-dessus au sélecteur de modèles et marquage dans le système de la capacité de vision de `Qwen3 VL 8B Instruct`. Le numéro de version est mis à jour en 15.7.7.",
    "Noureon continuera d’introduire de nouveaux modèles et d’améliorer l’expérience d’utilisation.<br><br>L’équipe Noureon"
  ],
  "15.7.6": [
    "<strong>[Prise en charge multimodale] Noureon prend en charge les modèles de vision d’OpenRouter.</strong>Lorsqu’un modèle compatible avec la vision est sélectionné, il est possible d’envoyer des images afin que l’IA comprenne leur contenu et mène une conversation mêlant texte et images.",
    "<strong>[Extension de la bibliothèque de modèles] Ajout de deux modèles de vision Qwen (Tongyi Qianwen) :</strong>ajout de <strong>`qwen3-vl-235b-instruct` (payant)</strong> et de <strong>`qwen2.5-vl-72b-instruct:free` (gratuit)</strong>.",
    "<strong>[Ajustement de l’interface] Boutons de fonction dynamiques :</strong>les options « Appareil photo » et « Image » du bouton « + » à côté de la zone de saisie ne s’affichent que lorsqu’un modèle compatible avec la vision est sélectionné.",
    "<strong>[Mise à jour et corrections en arrière-plan]</strong>Le numéro de version de l’application est mis à jour en 15.7.6, et des textes de description des nouveaux modèles sont ajoutés au fichier de langue (`i18n.js`) afin de fournir des informations plus complètes."
  ],
  "15.7.5": [
    "<strong>[Mise à jour de l’interface] Ajout d’un sélecteur de modèles « hiérarchique ».</strong>Face à la croissance continue de la bibliothèque de modèles, le processus de sélection des modèles est refondu. Il est possible de choisir successivement « Fournisseur » > « Type de tarification » > « Entreprise d’IA » > « Usage du modèle ».",
    "<strong>[Extension de la bibliothèque de modèles] Ajout de 12 modèles.</strong>La prise en charge d’OpenRouter est étendue avec 12 nouveaux modèles d’OpenAI, Anthropic, Deepseek, MoonshotAI et d’autres entreprises, dont la <strong>série GPT-4.1</strong> et <strong>Claude 4.5 Sonnet</strong>.",
    "<strong>[Ajustement de la gestion] L’ordre des modèles dans la page des paramètres est synchronisé avec le sélecteur.</strong>La page de gestion des modèles dans « Paramètres » adopte la même structure de catégories, et l’ordre peut être défini au sein de chaque groupe de catégories.",
    "<strong>[Correction]</strong>Correction du problème où la hauteur de la fenêtre du sélecteur de modèles ne changeait pas et où une barre de défilement superflue apparaissait lors d’un clic sur « Retour » ; correction de l’erreur des versions précédentes qui empêchait de cliquer sur les modèles OpenRouter pour les sélectionner."
  ],
  "15.7.4": [
    "<strong>[Mise à jour de l’interface] Ajout d’un sélecteur de modèles à plusieurs niveaux.</strong>Le sélecteur de modèles est refondu : il est possible de choisir successivement « Fournisseur » > « Type de tarification » > « Entreprise d’IA ».",
    "<strong>[Extension de la bibliothèque de modèles] Ajout de 9 modèles.</strong>Neuf modèles sont ajoutés à OpenRouter, dont la <strong>série GPT-5 et GPT-4.1 Mini d’OpenAI</strong>, les <strong>modèles Grok de x-ai</strong> et le <strong>modèle de Qwen dédié au code</strong>.",
    "<strong>[Mise à jour synchronisée] Interface de gestion des modèles.</strong>La page de gestion des modèles dans « Paramètres » est mise à jour avec la nouvelle structure de catégories, et l’ordre des modèles peut être défini au sein de leur groupe de catégories respectif.",
    "<strong>[Ajustement des noms]</strong>Afin de normaliser les noms de modèles, le préfixe « Noureon- » est supprimé de tous les noms de modèles au profit de noms génériques (par exemple Gemini 2.5 Pro).",
    "<strong>[Correction]</strong>Correction du problème où la hauteur du sélecteur de modèles ne changeait pas après un clic sur « Retour », et du problème où les modèles OpenRouter ne pouvaient pas être sélectionnés par un clic dans certains parcours."
  ],
  "15.7.3": [
    "<strong>[Mise à jour du système en arrière-plan] Mise à niveau des canaux de données :</strong>le système de traitement en arrière-plan de l’« historique des conversations », des « commentaires » et des « propositions Noureon » a été mis à niveau, afin que les données soient reçues de manière plus stable et plus fiable, et pour poser les bases des futures fonctions de personnalisation.",
    "<strong>[Enregistrement des données] Ajout de l’enregistrement du « modèle utilisé » :</strong>dans le nouveau canal de données, un enregistrement du « modèle utilisé » est ajouté, afin de comprendre les performances des différents modèles sur des tâches données et d’améliorer continuellement le service Noureon.",
    "<strong>Mise à jour du centre d’aide, des conditions d’utilisation et de la politique de confidentialité :</strong>le centre d’aide, les conditions d’utilisation et la politique de confidentialité ont été mis à jour ; veuillez les consulter."
  ],
  "15.7.2": [
    "<strong>[Nouvelle fonction] Programme d’amélioration de Noureon :</strong>afin d’améliorer continuellement la qualité des réponses de Noureon, un processus d’apprentissage de l’IA est mis en place. Une partie des données de conversation anonymisées sera utilisée pour analyser et optimiser les modèles d’IA.",
    "<strong>Protection de la vie privée :</strong>toutes les données utilisées pour ce programme sont protégées ; leur seul objectif est l’entraînement de Noureon, et elles ne seront utilisées à aucune autre fin ni partagées avec aucun tiers.",
    "<strong>[Correction importante]</strong>Correction d’un problème occasionnel : à l’ouverture d’une toute nouvelle conversation, les données de questions-réponses du premier tour ne pouvaient parfois pas être intégrées au processus d’apprentissage du modèle d’IA. La nouvelle version garantit la stabilité de ce processus."
  ],
  "15.7.1": [
    "<strong>[Nouvelle fonction] Surbrillance et synchronisation de la Chronologie.</strong> La Chronologie met automatiquement en surbrillance le message actuellement consulté dans l’affichage principal.",
    "<strong>Positionnement en temps réel :</strong> lors du défilement d’une longue conversation, la Chronologie met à jour l’élément en surbrillance en temps réel, ce qui permet de repérer la position de lecture actuelle.",
    "<strong>[Correction importante] Correction du chevauchement de l’interface :</strong> correction d’une erreur d’affichage sur appareil mobile où le message d’accueil initial chevauchait la barre de fonctions supérieure. La nouvelle mise en page dynamique s’adapte à toutes les tailles d’écran.",
    "<strong>Optimisation :</strong> amélioration des performances de rendu lors du défilement de la page, afin de garantir que l’ajout de la nouvelle fonction n’affecte pas la fluidité de l’application."
  ],
  "15.7.0": [
    "<strong>[Nouvelle fonction] Ajout de la barre latérale « Chronologie ».</strong> Elle permet de repérer rapidement un message précis dans une longue conversation.",
    "<strong>Ouverture par glissement :</strong> sur ordinateur, déplacez la souris vers le bord droit de l’écran ; sur mobile, balayez de droite à gauche pour l’ouvrir.",
    "<strong>Saut rapide :</strong> un clic sur un message de la Chronologie permet d’accéder immédiatement à l’emplacement correspondant dans l’affichage principal, avec un effet de surbrillance.",
    "<strong>Optimisation :</strong> l’animation de transition du processus de connexion est plus fluide et plus rapide, pour une meilleure expérience de démarrage.",
    "<strong>Optimisation :</strong> lorsque la conversation en cours de consultation est supprimée, le système ouvre désormais automatiquement une nouvelle conversation, pour un fonctionnement plus intuitif.",
    "<strong>Correction :</strong> résolution du problème de scintillement de l’écran ou de transition peu fluide pouvant survenir après la connexion sur certains appareils."
  ],
  "15.6.1": [
    "<strong>Optimisation :</strong>fluidité de l’animation de repli et de déploiement à l’intérieur de la barre latérale",
    "<strong>Optimisation :</strong>l’envoi de fichiers et d’images est regroupé en une seule fonction d’envoi",
    "<strong>Optimisation :</strong>style d’interface du déploiement du bouton « + » et des fonctions étendues de la zone de saisie",
    "<strong>Correction :</strong>problème de transparence trop élevée du menu des modèles"
  ],
  "15.6.0": [
    "<strong>Optimisation :</strong>nouvelle fonction de surbrillance de la conversation sélectionnée dans l’historique, pour mieux identifier la conversation actuellement chargée",
    "<strong>Ajout :</strong>davantage de Nouras",
    "<strong>Correction :</strong>problème de la recherche globale qui retournait des enregistrements se trouvant dans la corbeille"
  ],
  "15.5.0": [
    "<strong>Mise à jour :</strong>tout nouveau style de la barre latérale"
  ],
  "15.4.9": [
    "<strong>Correction :</strong>correction du problème où l’écran de chargement faisait défiler la page d’accueil située en dessous"
  ],
  "15.4.6": [
    "<strong>Optimisation :</strong>style de sortie du texte"
  ],
  "15.4.2": [
    "<strong>Optimisation :</strong>problème de défilement forcé vers le bas pendant la sortie de l’IA"
  ],
  "15.3.8": [
    "<strong>Correction :</strong>problème de contenu en double dans la fonction de recherche"
  ],
  "15.3.7": [
    "<strong>Correction :</strong>problème de zoom de l’écran provoqué par la zone de saisie"
  ],
  "15.3.6": [
    "<strong>Correction :</strong>problème de masquage par la zone de saisie"
  ],
  "15.3.5": [
    "<strong>Correction :</strong>problème des tableaux de réponse de l’IA qui dépassaient de l’écran sur la version mobile"
  ],
  "15.3.4": [
    "<strong>Ajout :</strong>gemini2.5-Pro, gemini2.5-flash en préversion, gemini2.5-flash-lite en préversion",
    "<strong>Suppression :</strong>modèle Pico"
  ],
  "15.3.3": [
    "<strong>BÊTA :</strong>version de test interne"
  ],
  "15.3.2": [
    "<strong>BÊTA :</strong>version de test interne"
  ],
  "15.3.1": [
    "<strong>Optimisation :</strong>les questions de suivi correspondront mieux aux habitudes des utilisateurs",
    "<strong>Remplacement :</strong>le modèle Mill est remplacé par le modèle Mistral3.2"
  ],
  "15.3.0": [
    "<strong>Ajout :</strong>fonction de commentaires et de propositions de Nouras"
  ],
  "15.2.1": [
    "<strong>Correction :</strong>dans la zone de saisie, Entrée provoque désormais un retour à la ligne et Maj+Entrée valide l’envoi",
    "<strong>Correction :</strong>problème du code de réponse de l’IA qui dépassait du cadre de l’écran"
  ],
  "15.2.0": [
    "<strong>Correction :</strong>la zone de saisie ne permettait pas le retour à la ligne ni le déploiement"
  ],
  "15.1.1": [
    "<strong>Correction :</strong>problème d’affichage erroné des fonctions « + » avec les modèles OpenRouter"
  ],
  "15.0.1": [
    "<strong>Correction :</strong>problème de la fenêtre de mise à jour qui s’affichait par erreur",
    "<strong>Remplacement :</strong>le modèle Ultra a été remplacé par Grok4-fast"
  ],
  "15.0.0": [
    "<strong>Ajout :</strong>fonction de mémoire inter-conversations",
    "<strong>Optimisation :</strong>logique et prompts de la fonction de mémoire inter-conversations",
    "<strong>Optimisation :</strong>logique et prompts des fonctions d’apprentissage et de recherche",
    "<strong>Correction :</strong>problème des fonctions supplémentaires à l’intérieur et à l’extérieur de la zone de saisie qui dépassaient du côté droit de la zone",
    "<strong>Correction :</strong>problème de la fonction d’importation de la page d’accueil de la version mobile qui ne parvenait pas à importer",
    "<strong>Correction :</strong>problème des fonctions supplémentaires à l’intérieur et à l’extérieur de la zone de saisie qui chevauchaient la zone de saisie"
  ],
  "14.9.9": [
    "<strong>Optimisation :</strong>logique des notifications push de mise à jour de version"
  ],
  "14.9.8": [
    "<strong>Optimisation :</strong>animation des fonctions étendues de la zone de saisie",
    "<strong>Optimisation :</strong>problème de netteté de la police de la zone de saisie"
  ],
  "14.9.7": [
    "<strong>Correction :</strong>problème de largeur non uniforme en haut et en bas de la zone de saisie",
    "<strong>Correction :</strong>problème de la zone de saisie qui ne se repliait pas correctement après l’annulation des fonctions étendues",
    "<strong>Optimisation :</strong>mode d’affichage des fonctions étendues de la zone de saisie"
  ],
  "14.9.6": [
    "<strong>Ajout :</strong>modification de l’emplacement de la recherche en ligne et de l’utilisation des Nouras en cours de saisie"
  ],
  "14.9.5": [
    "<strong>Correction :</strong>problème des boutons qui ne pouvaient pas être remplis avec un dégradé de couleurs"
  ],
  "14.9.4": [
    "<strong>Optimisation :</strong>modification de la transparence de la couleur d’arrière-plan du contenu joint dans la zone de saisie"
  ],
  "14.9.3": [
    "<strong>Correction :</strong>problème du contenu joint de la zone de saisie qui était recouvert lors de son affichage"
  ],
  "14.9.2": [
    "<strong>Optimisation :</strong>problème de navigation de la Boutique Nouras"
  ],
  "14.9.1": [
    "<strong>Optimisation :</strong>couleur de la police de la Boutique Nouras"
  ],
  "14.9.0": [
    "<strong>Ajout :</strong>la Boutique Nouras intègre le fond d’écran personnalisé et reçoit un effet de verre gélatineux"
  ],
  "14.8.17": [
    "<strong>Ajout :</strong>effets d’interaction entre la zone de saisie du chat et le module de questions de suivi"
  ],
  "14.8.16": [
    "<strong>Optimisation :</strong>suppression du zoom à deux doigts et du zoom par double appui sur mobile"
  ],
  "14.8.15": [
    "<strong>Optimisation :</strong>optimisation des animations existantes"
  ],
  "14.8.14": [
    "<strong>Optimisation :</strong>modification de la logique d’ouverture et de fermeture des questions de suivi"
  ],
  "14.8.13": [
    "<strong>Optimisation :</strong>problème de la taille trop grande du module de questions de suivi sur ordinateur",
    "<strong>Suppression :</strong>superposition du masque gris lors du déploiement de la barre latérale"
  ],
  "14.8.12": [
    "<strong>Optimisation :</strong>matériau en verre gélatineux de la barre latérale, de la zone de questions de suivi et des bulles de message"
  ],
  "14.8.11": [
    "<strong>Optimisation :</strong>l’arrière-plan des questions de suivi adopte un style de bulle flottante",
    "<strong>Correction :</strong>problème du nom de la fenêtre de chat qui ne s’adaptait pas automatiquement"
  ],
  "14.8.10": [
    "<strong>Optimisation :</strong>réduction de la zone de texte sélectionnable de la page, pour une meilleure expérience d’utilisation",
    "<strong>Ajout :</strong>ajout d’une fonction de conservation des messages : les messages saisis sont conservés lors du changement de conversation"
  ],
  "14.8.9": [
    "<strong>Ajout :</strong>ajout dans la page « Paramètres » de la fonction Corbeille, qui permet à l’utilisateur de consulter les documents supprimés, de les supprimer définitivement ou de les restaurer."
  ],
  "14.8.8": [
    "<strong>Ajout :</strong>ajout dans la page « À propos » d’un accès aux informations de mise à jour des versions, qui permet à l’utilisateur de consulter le journal des mises à jour de toutes les versions.",
    "<strong>Ajout :</strong>ajout du commutateur « Activer les notifications de mise à jour » : lorsqu’il est activé, le contenu de la dernière mise à jour s’affiche dans une fenêtre à chaque chargement.",
    "<strong>Optimisation :</strong>le contenu du journal des mises à jour est regroupé dans un fichier distinct, update-logs.js, afin de faciliter la maintenance et les modifications ultérieures."
  ],
  "14.8.6": [
    "<strong>Ajout :</strong>les éléments de la barre latérale de la version mobile prennent en charge l’appui long pour ouvrir un menu rapide.",
    "<strong>Optimisation :</strong>le graphique de répartition des messages du tableau de bord des données bénéficie d’un filtre par année / mois / jour.",
    "<strong>Correction :</strong>correction du problème d’éléments peu lisibles de la page de la Boutique Nouras en mode de fond d’écran personnalisé."
  ],
  "14.8.5": [
    "<strong>Ajout :</strong>tout nouveau tableau de bord personnel des données, qui fournit des graphiques statistiques tels que la proportion d’utilisation des modèles et la répartition du nombre de messages.",
    "<strong>Ajout :</strong>bouton « Faire défiler vers le bas », qui permet d’accéder rapidement au message le plus récent lorsqu’il y a beaucoup de messages.",
    "<strong>Optimisation :</strong>fonction de recherche en langage naturel, qui calcule désormais un score de pertinence selon le poids des mots-clés, pour des résultats de recherche plus précis."
  ]
};
