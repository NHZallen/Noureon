// Centre d'aide, Conditions d'utilisation et Politique de confidentialité (français). Même structure que zh-TW.js : mêmes ids de sections, dans le même ordre, avec le même nombre de blocs.

export default {
  help: {
    title: 'Centre d’aide',
    updated: 'Dernière mise à jour : 10 octobre 2026 (à partir de Noureon 18.4.0)',
    intro: [
      'Noureon est une application web qui réunit les modèles d’IA de nombreux fournisseurs dans un seul espace de travail : discussion multi-modèles, Conseil des modèles, recherche approfondie, fichiers et présentations, génération d’images, extensions (compétences, outils en ligne de commande et connecteurs), mémoire et synchronisation cloud, le tout dans le navigateur, avec une installation possible comme application. Cette page explique comment fonctionne chaque fonction, où vont vos données et que faire en cas de problème.',
      'Si vous ne trouvez pas de réponse, écrivez à support@noureon.com (ce qu’il faut joindre est indiqué dans « Nous contacter et signaler un problème », à la fin). Les Conditions d’utilisation et la Politique de confidentialité sont des documents séparés ; lisez-les avant d’utiliser les fonctions cloud.'
    ],
    sections: [
      {
        id: 'start',
        h: '1. Premiers pas',
        blocks: [
          'Noureon ne fournit pas de crédit de modèle et ne revend pas l’usage des modèles : vous apportez une clé API de chaque fournisseur que vous voulez utiliser, et vous réglez directement le coût auprès du fournisseur. Le chemin le plus court :',
          [
            'Sur la page de connexion, saisissez un nom et un mot de passe pour créer un « compte local » : ses données restent dans ce navigateur. Vous pouvez aussi lier un e-mail ou un compte Google dans Réglages → Personnalisation pour utiliser un compte cloud et la synchronisation.',
            'Allez dans Réglages → Gestion des modèles, trouvez la gestion des clés API et saisissez une clé d’au moins un fournisseur : Google Gemini, OpenRouter (une clé ouvre tous les modèles qu’il relaie) ou NVIDIA (modèles gratuits). Ne configurez que ceux que vous utiliserez.',
            'De retour dans la discussion, choisissez un modèle à côté de la zone de message, écrivez un message et envoyez-le. Sans clé, la zone de message vous invite d’abord à en ajouter une dans les réglages.'
          ],
          'Par défaut, les clés restent dans votre navigateur et ne sont pas envoyées. Elles ne sont transmises, chiffrées et temporairement, au serveur de Noureon que si vous choisissez que les réponses soient produites par le serveur (voir « Exécution sur le serveur » et la Politique de confidentialité). N’envoyez jamais une clé, un mot de passe de synchronisation ou des données de récupération à personne, support compris.'
        ]
      },
      {
        id: 'accounts',
        h: '2. Comptes, connexion et récupération',
        blocks: [
          [
            'Compte local : créé sur la page de connexion avec un nom et un mot de passe ; ses données restent uniquement dans ce navigateur. Si vous effacez les données du navigateur ou changez de navigateur ou d’appareil, vous ne les verrez plus : exportez régulièrement une sauvegarde.',
            'Compte cloud : liez un e-mail (mot de passe d’au moins 8 caractères, à vérifier depuis votre boîte de réception) ou un compte Google ; vous pouvez lier les deux. Il faut un compte cloud pour la synchronisation, l’exécution sur le serveur, le stockage cloud des compétences et les identifiants sécurisés.',
            'L’inscription, la connexion et la récupération du mot de passe affichent un contrôle anti-robot Cloudflare Turnstile, qui écarte les abus automatisés.'
          ],
          'Mot de passe de connexion oublié : choisissez « mot de passe oublié » sur l’écran de connexion ; un code à 8 chiffres est envoyé dans votre boîte, que vous saisissez pour définir un nouveau mot de passe. Mot de passe de synchronisation oublié : choisissez la récupération par e-mail ; un lien est envoyé, à ouvrir dans le même navigateur que celui qui l’a demandé. Vous recevez aussi un e-mail quand un nouveau mode de connexion est ajouté (par exemple Google) ou que le mot de passe est changé ; si ce n’est pas vous, changez le mot de passe aussitôt et prévenez-nous.',
          'Pour supprimer un compte cloud et tout ce qu’il contient, écrivez à support@noureon.com depuis l’e-mail d’inscription ; nous traitons la demande selon les règles de conservation et de suppression de la Politique de confidentialité.'
        ]
      },
      {
        id: 'chat',
        h: '3. Discussion et organisation',
        blocks: [
          [
            'Choisir un modèle : le sélecteur à côté de la zone de message liste tous les modèles disponibles (actuellement 38 options de 14 fournisseurs), avec recherche et regroupement par fournisseur ; les modèles qui acceptent un niveau de réflexion affichent un curseur de réflexion.',
            'La zone de message : collez du texte, joignez des fichiers, prenez une photo, dictez à la voix, choisissez une compétence avec / et un outil en ligne de commande avec @. La zone peut s’agrandir en grande fenêtre.',
            'Nouras : des assistants IA réutilisables, avec leur nom, leur description, leurs instructions et leur avatar. Choisissez des Nouras officiels dans la boutique, créez les vôtres, proposez un nouveau Noura ou partagez-en un par transfert d’appareil à appareil.',
            'Dossiers, archives et corbeille : les discussions peuvent aller dans des dossiers (couleur et icône personnalisables), être archivées ou déplacées dans la corbeille ; sélection et déplacement par lots ; la corbeille permet de restaurer ou de supprimer définitivement.',
            'Discussion temporaire : on l’utilise et on part ; aucune trace n’est gardée, et la réponse est produite sur votre appareil, jamais sur le serveur.',
            'Recherche dans l’historique : par mot-clé du titre, mot-clé du contenu ou en langage naturel ; une chronologie permet de sauter à un message dans une longue discussion.',
            'Tableau de bord personnel : nombre de discussions, de dossiers, modèle le plus utilisé, répartition de l’usage par modèle et répartition des messages dans le temps, calculés sur votre appareil.',
            'Fonctions intelligentes : dans les réglages, vous pouvez activer ou désactiver le « nom automatique des discussions » et la « recherche intelligente ».'
          ]
        ]
      },
      {
        id: 'council',
        h: '4. Conseil des modèles',
        blocks: [
          'Le Conseil des modèles fait donner à 2 à 5 modèles chacun son avis sur la même question, puis un synthétiseur de votre choix rédige une seule réponse.',
          [
            'Mode consensus : chaque membre répond indépendamment et le synthétiseur rassemble. Mode discussion : les membres répondent d’abord seuls, puis révisent après avoir lu les autres, et le synthétiseur écrit la conclusion.',
            'La réponse comporte un tableau « consensus et différences » : qui était d’accord, qui hésitait, et comment la question a été tranchée.',
            'Quand c’est utile, le conseil fait une seule recherche commune et chaque membre s’appuie sur le même « paquet de recherche partagé ». Les pièces jointes qu’un membre ne peut pas lire sont d’abord converties en paquet de texte par le modèle de « traduction de documents du conseil » choisi dans les réglages.',
            'Un ensemble de membres peut être enregistré en groupe et réappliqué plus tard.',
            'Par défaut, le conseil se tient sur le serveur de Noureon et se termine même si vous fermez la page ; si vous choisissez de n’exécuter que sur votre appareil, il se tient dans le navigateur. Chaque appel à un modèle attend au plus 30 minutes ; un membre qui dépasse le délai est compté comme échoué et les autres continuent.'
          ]
        ]
      },
      {
        id: 'research',
        h: '5. Recherche approfondie',
        blocks: [
          'La recherche approfondie convient aux questions qui demandent beaucoup de recherches et un rapport avec ses sources. On la lance depuis le menu de la zone de message.',
          [
            'D’abord un plan : le modèle rédige un plan de recherche (jusqu’à 8 points) et un compte à rebours de 60 secondes démarre, pendant lequel vous pouvez modifier les points ; pendant que vous modifiez, il attend au plus 10 minutes. À la fin du compte à rebours, il démarre seul.',
            'Point par point : il cherche, lit des pages, recoupe et prend des notes pour chaque point. Une recherche utilise au plus environ 300 appels (recherches, pages ouvertes, consultations dans une page) et au plus 60 minutes de temps de recherche.',
            'Avancement visible : la carte montre en direct les points terminés, le pourcentage, le nombre de recherches et le temps écoulé, et vous pouvez ouvrir les sources et l’activité.',
            'Vous pouvez mettre en pause, arrêter, ou envoyer un message avec des consignes supplémentaires ; une pause dure au plus 24 heures ; la recherche entière au plus environ 26 heures.',
            'La recherche s’exécute sur le serveur de Noureon : fermez l’onglet ou verrouillez le téléphone, et le résultat est dans la discussion à votre retour. Après un redémarrage du serveur, elle reprend à son dernier point de contrôle.',
            'Le résultat est un rapport avec citations et graphiques : aperçu dans la discussion ou ouverture en plein écran (table des matières, cartes de citation, panneaux des sources et de l’activité), et export en PDF, Word ou Markdown ; le fichier est créé au moment de l’export.'
          ],
          'La recherche a besoin d’un service de recherche web : les modèles Gemini peuvent utiliser leur recherche intégrée ; pour les autres modèles, saisissez une clé Tavily ou TinyFish sous « Recherche web » dans les réglages. Un rapport peut contenir des informations fausses ou périmées ; vérifiez les faits importants dans les sources citées.'
        ]
      },
      {
        id: 'search',
        h: '6. Recherche web',
        blocks: [
          [
            'Les modèles Gemini peuvent utiliser leur recherche intégrée. Les modèles OpenRouter et NVIDIA utilisent le service Tavily ou TinyFish que vous choisissez : dans Réglages → Gestion des modèles → Recherche web, choisissez la source et saisissez la clé ; Tavily propose une profondeur de base ou avancée, et TinyFish sert aussi à lire les adresses que vous collez.',
            'Avec la « recherche intelligente » activée, Noureon décide si un message doit d’abord chercher sur le web ; avec une clé OpenRouter, un petit modèle de jugement aide à décider (ce qu’il reçoit est dans la Politique de confidentialité), et s’il échoue ou tarde, l’application utilise ses propres listes de mots.',
            'Quand un modèle n’a pas de capacité d’outils, la recherche est d’abord faite par le serveur, qui donne les pages trouvées au modèle comme « paquet de recherche » ; vous pouvez aussi, dans les réglages, ne faire les recherches que sur votre appareil.',
            'Les sources citées dans une réponse sont numérotées, avec le nom du site et sa petite icône à côté.'
          ]
        ]
      },
      {
        id: 'attachments',
        h: '7. Pièces jointes, appareil photo et voix',
        blocks: [
          [
            'Pièces jointes : images, documents, audio et vidéo. La lecture directe dépend du modèle et du fournisseur ; un document que le modèle ne peut pas lire peut d’abord être converti en texte détaillé par le « modèle de traduction de documents pour un seul modèle » des réglages, pour cette seule requête.',
            'Appareil photo : prenez une photo et joignez-la directement.',
            'Saisie vocale : appuyez sur le micro, une forme d’onde montre votre voix, appuyez sur la coche pour finir ou sur la croix pour jeter. Votre navigateur transforme la voix en texte et peut transmettre l’audio à votre système d’exploitation ou à un service de reconnaissance vocale en ligne ; Noureon ne garde pas d’enregistrement à part. Ceci est expliqué à la première utilisation.'
          ],
          'Une requête a une taille limite (le serveur accepte des requêtes jusqu’à 25 Mo) ; envoyez les très grosses pièces jointes en plusieurs fois.'
        ]
      },
      {
        id: 'files',
        h: '8. Fichiers et présentations',
        blocks: [
          'Demandez au modèle, dans la discussion, de créer des fichiers : présentations (PPTX), Word (DOCX), Excel (XLSX), PDF, et une dizaine d’autres formats comme CSV, calendriers et sous-titres.',
          [
            'Les fichiers apparaissent sous forme de cartes ; chacun peut être prévisualisé et téléchargé, et plusieurs peuvent être regroupés dans un ZIP.',
            'Il y a 20 designs de présentation et 9 styles de document au choix ; le modèle peut aussi suivre un style que vous décrivez.',
            'Contrôle visuel : une fois la présentation faite, chaque diapositive peut être dessinée en image pour qu’un modèle de votre choix revérifie la mise en page et la corrige si besoin ; activez ou désactivez le contrôle visuel automatique dans les réglages. Les images ne sont pas conservées.',
            'Les fichiers sont créés dans votre navigateur (ou dans le bac à sable du serveur) ; avec un compte cloud, les fichiers créés sont enregistrés dans votre propre stockage cloud.'
          ]
        ]
      },
      {
        id: 'images',
        h: '9. Génération d’images',
        blocks: [
          [
            'Les modèles qui gèrent la génération d’images (actuellement 4 modèles d’image, dont GPT Image, FLUX et Nano Banana) peuvent dessiner dans la discussion, acceptent des images de référence, un format et une qualité, et permettent de continuer à retoucher ensuite.',
            'Les images peuvent être prévisualisées, téléchargées, réutilisées ou ouvertes dans le flux d’édition d’image.',
            'Par défaut, les images sont produites par le serveur et se terminent même si vous fermez la page ; si le serveur redémarre pendant un dessin, la requête peut être renvoyée au fournisseur, qui peut alors facturer deux fois. Si vous choisissez de n’exécuter que sur votre appareil, ou utilisez une discussion temporaire, ou n’êtes pas connecté, les images sont produites dans le navigateur.'
          ]
        ]
      },
      {
        id: 'advanced',
        h: '10. Mode avancé (bac à sable Python)',
        blocks: [
          'Le mode avancé laisse le modèle écrire du Python pour traiter des données, tracer des graphiques et créer des fichiers. Le code s’exécute dans un bac à sable isolé :',
          [
            'Exécuté par le serveur : le code et les fichiers joints vont au serveur de bac à sable de Noureon et s’exécutent dans un conteneur sans réseau, à mémoire et CPU limités, supprimé à la fin de la réponse ; les fichiers créés sont enregistrés dans votre stockage cloud et listés dans la réponse.',
            'Exécuté dans le navigateur : le code s’exécute dans une page isolée (run.noureon.com) avec Pyodide, chargé depuis jsDelivr.',
            'Quand le bac à sable échoue, la connexion est retentée et, au besoin, le travail est rendu au navigateur.'
          ],
          'Le stockage cloud est limité à 500 Mo par utilisateur (pièces jointes et fichiers créés ensemble ; les réglages montrent l’usage) ; les fichiers que plus aucune discussion n’utilise (par exemple après la suppression d’une discussion) sont supprimés automatiquement après environ un jour.'
        ]
      },
      {
        id: 'extensions',
        h: '11. Extensions : compétences, outils en ligne de commande et connecteurs',
        blocks: [
          'La page Extensions (barre latérale gauche, ou liste de gauche sur ordinateur) comporte trois parties.',
          [
            'Compétences : une méthode de travail écrite (SKILL.md : nom, description, texte). Il y a 11 compétences officielles (dont la compétence officielle pour créer des compétences). Tapez / dans la zone de message et choisissez une compétence, et cette réponse la suivra ; le modèle peut aussi décider seul : il ne voit que le nom et une ligne de chaque compétence autorisée, et charge le texte complet quand il en a besoin (au plus 5 par réponse ; chaque compétence a un interrupteur « autoriser le modèle à l’utiliser seul »).',
            'Vos propres compétences : collez du texte ou importez un zip (SKILL.md avec notes, scripts et ressources ; 5 Mo et 60 fichiers au maximum ; vérifié dans le navigateur puis de nouveau sur le serveur, qui refusent programmes et installateurs, liens et chemins dangereux). Jusqu’à 50 compétences. Vous pouvez aussi demander au modèle de vous aider à en créer une ; le brouillon s’affiche sous forme de carte et n’est enregistré qu’après votre confirmation.',
            'Compétences avec scripts : un script ne s’exécute que si le modèle l’exécute explicitement, dans un conteneur de bac à sable isolé sur le serveur (le dossier de la compétence est en lecture seule et non exécutable, sans réseau par défaut) ; les discussions temporaires n’offrent pas de compétences avec scripts.',
            'Outils en ligne de commande : 8 outils officiels (par exemple Pandoc, FFmpeg, yt-dlp, csvkit), exécutés dans un conteneur isolé sur le serveur. Activez-les dans la page Extensions, puis choisissez-en un avec @, ou autorisez le modèle à les utiliser seul. Le programme d’un outil est téléchargé par l’hôte du bac à sable depuis sa publication officielle (GitHub) et vérifié par rapport à une empreinte fixe.',
            'Connexions aux sites et consentement : chaque fois qu’un outil a besoin d’un site, la connexion passe par un proxy de filtrage du serveur, qui n’ouvre que les ports 80 et 443 et n’atteint jamais le serveur lui-même ni son réseau interne. Chaque site est traité selon vos règles dans Réglages → Autorisations : autoriser, demander ou refuser ; un site sans règle est demandé dans la discussion, et l’absence de réponse en 10 minutes vaut refus.',
            'Identifiants sécurisés : quand un outil a besoin d’une connexion (par exemple le cookie de connexion d’un compte), une fenêtre vous le demande et il est conservé chiffré sur le serveur ; vous pouvez le consulter, le remplacer ou le supprimer à tout moment dans Réglages → Autorisations. Le modèle ne voit jamais la valeur, et un identifiant dans la sortie d’une commande est masqué.',
            'Connecteurs : connectez-vous à votre propre compte sur un service et le modèle pourra lire ce qui vous y appartient et, si vous l’autorisez, le modifier (pour l’instant Notion et Linear). La connexion se fait sur la page du service lui-même ; Noureon ne voit jamais votre mot de passe, et la connexion est conservée chiffrée sur le serveur. Dans Extensions → Connecteurs, vous réglez chaque outil sur autoriser, demander à chaque fois ou refuser : les outils de lecture sont autorisés au départ, les outils d’écriture demandent. Un outil qui demande affiche dans la discussion une carte avec ses paramètres exacts et trois réponses (autoriser une fois, toujours autoriser, refuser) ; sans réponse en 10 minutes, c’est un refus. Quand le service le permet (Linear), vous pouvez choisir une connexion en lecture seule. Une réponse fait au plus 30 appels à des services. Les connecteurs ne servent que dans les réponses faites par le serveur, pas dans les discussions temporaires ; ce que le modèle lit sur un service va au fournisseur de modèle que vous avez choisi.'
          ],
          'Quand un outil récupère du contenu de sites web, respectez les conditions et les règles de droit d’auteur de ces sites ; voir les Conditions d’utilisation.'
        ]
      },
      {
        id: 'server',
        h: '12. Exécution sur le serveur et fermeture de l’onglet',
        blocks: [
          'Une fois connecté à un compte cloud, les réponses sont produites par défaut sur le serveur de Noureon : fermer l’onglet ou verrouiller le téléphone ne les arrête pas, et le résultat est dans la discussion à votre retour. Cela couvre les réponses ordinaires, le Conseil des modèles, la recherche approfondie, la génération d’images, la recherche web, le mode avancé et le contrôle visuel.',
          [
            'Pour ne produire les réponses que sur votre appareil : Réglages → Confidentialité, choisissez « Cet appareil ».',
            'Les discussions temporaires, les utilisateurs non connectés et les réponses qui ont besoin du navigateur (saisie vocale, appareil photo) sont toujours produits sur votre appareil.',
            'Une réponse peut durer 2 heures au plus ; 5 au plus en même temps ; 10 nouvelles au plus par minute.',
            'Pour la réponse, votre clé API est conservée chiffrée un court moment et supprimée à la fin de la réponse (au plus 2 h 15 pour une réponse ordinaire, 30 minutes pour une image, 27 heures pour une recherche approfondie) ; elle n’est jamais gardée longtemps ni écrite dans des journaux.',
            'Avec plusieurs onglets ouverts, la réponse s’affiche en direct dans tous ; une connexion perdue se rétablit seule.'
          ]
        ]
      },
      {
        id: 'memory',
        h: '13. Mémoire et rappel entre discussions',
        blocks: [
          [
            'Préférences personnelles confirmées : dans Réglages → Gestion de la mémoire, vous pouvez les ajouter, les remplacer ou les supprimer vous-même, et ajouter des règles « ne pas évoquer », par exemple de ne pas mentionner votre nom ou vos informations de santé.',
            'Mémoire automatique : activée, Noureon utilise votre clé Gemini pour transformer les discussions en résumés et en préférences possibles que vous confirmez ; la désactiver n’arrête que les nouveaux souvenirs, les confirmés restent et se suppriment un par un.',
            'Rappel entre discussions : demande votre consentement explicite. Activé, cet appareil envoie votre question actuelle à Gemini Embedding 2 et utilise un index local pour trouver jusqu’à trois résumés pertinents de discussions antérieures ; les sources ne sont pas montrées dans la discussion. Le consentement suit votre compte sur tous les appareils, mais l’index et les vecteurs ne sont pas synchronisés : chaque appareil construit le sien ; vous pouvez vérifier ou optimiser l’index local dans les réglages.',
            'Les images, vidéos, audios et documents joints peuvent être résumés via la fonction de fichiers de Gemini quand la mémoire est construite.'
          ]
        ]
      },
      {
        id: 'data',
        h: '14. Données, synchronisation, export et suppression',
        blocks: [
          [
            'Local d’abord : discussions, dossiers, archives, réglages, Nouras, clés API, préférences d’apparence et index de mémoire sont conservés par défaut dans votre navigateur. Effacer les données du navigateur peut les supprimer.',
            'Synchronisation cloud : à activer dans Réglages → Personnalisation après avoir lié un e-mail ou un compte Google. Elle comprend les discussions et messages, dossiers, Nouras, souvenirs et résumés, métadonnées de synchronisation, marqueurs de suppression et les fichiers que vous importez ou créez. Pour synchroniser les clés API, vous devez d’abord créer un mot de passe de synchronisation (au moins 10 caractères) ; les clés et autres données sensibles sont chiffrées avec lui avant l’envoi.',
            'Gardez vous-même le mot de passe de synchronisation : une fois effacé, les données chiffrées existantes ne peuvent plus être déchiffrées. Le mot de passe de synchronisation lui-même est conservé chiffré par une clé côté serveur, pour la récupération entre appareils et par e-mail.',
            'Export et import (Réglages → Gestion des données) : exportez en .json ou .zip (historique des discussions avec archives et dossiers, Nouras, réglages de l’application, préférences personnelles confirmées ; les clés API demandent un mot de passe de synchronisation pour être exportées en sécurité). L’import remplace vos données actuelles, vérifiez donc d’abord. Relisez un fichier exporté avant de le partager, surtout si vous avez choisi d’y inclure des données sensibles.',
            'Transfert d’appareil à appareil : dans les réglages, « Synchronisation entre appareils (P2P) », choisissez « Je veux envoyer » ou « Je veux recevoir », connectez-vous avec un code à 8 caractères ou en scannant un QR code, et les éléments choisis vont directement entre les deux appareils ; les Nouras peuvent aussi être partagés ainsi.',
            'Stockage : les pièces jointes cloud et fichiers créés ensemble sont limités à 500 Mo par utilisateur ; les images générées ne sont pas arrêtées par cette limite.',
            'Zone de danger : « Effacer tous les enregistrements et données » supprime définitivement tout dans ce navigateur et est irréversible. Quand vous êtes connecté et synchronisé, suppressions et restaurations sont aussi synchronisées vers le cloud.'
          ]
        ]
      },
      {
        id: 'appearance',
        h: '15. Apparence, langue et installation',
        blocks: [
          [
            'Apparence : clair, sombre ou selon le système, avec une couleur d’accent ; la page d’accueil avant la connexion a aussi un bouton clair/sombre en haut à droite.',
            'Langue : l’interface existe en chinois traditionnel, anglais, français, russe et espagnol, à changer dans Réglages → Personnalisation ; la « langue de réponse par défaut de l’IA » fixe la langue de ses réponses sauf demande contraire dans une discussion.',
            'Accessibilité : les réglages offrent des options d’accessibilité.',
            'Installer comme application : Noureon est une application web progressive (PWA) ; utilisez « Ajouter à l’écran d’accueil » ou « Installer » dans votre navigateur. Hors ligne, seule l’application mise en cache fonctionne ; tout ce qui a besoin d’un modèle ou du cloud demande un réseau.',
            'Avis de mise à jour : à chaque nouvelle version, un avis peut s’afficher (désactivable dans les réglages) ; l’historique complet est sur noureon.com/updates.'
          ]
        ]
      },
      {
        id: 'troubleshooting',
        h: '16. Dépannage',
        blocks: [
          [
            'Pas de réponse après l’envoi : vérifiez que la clé du fournisseur de ce modèle est correcte et créditée, puis essayez un autre modèle. Gemini, OpenRouter et NVIDIA ont chacun leurs messages d’erreur et leurs règles de quota.',
            'Une réponse est lente ou s’arrête : les longues réponses, la recherche approfondie et le conseil demandent du temps ; quand le serveur s’en charge, vous pouvez partir et revenir. Le serveur autorise 5 réponses en même temps et 10 nouvelles par minute par personne.',
            'La synchronisation ne se met pas à jour : vérifiez que vous êtes connecté, que le mot de passe de synchronisation est déverrouillé (saisissez-le au besoin dans la zone de synchronisation cloud des réglages) et que le réseau fonctionne, puis appuyez sur « Synchroniser maintenant ». Les changements hors ligne se synchronisent au retour de la connexion.',
            'Mot de passe de synchronisation oublié : récupérez par e-mail (voir « Comptes, connexion et récupération »). S’il a été effacé, les anciennes données chiffrées ne peuvent pas être déchiffrées.',
            'Des données ont disparu : vérifiez si vous avez changé de navigateur ou d’appareil ou effacé les données du navigateur ; les données d’un compte local n’existent que dans le navigateur où elles ont été créées. Cherchez dans la corbeille les discussions supprimées, ou importez une sauvegarde exportée plus tôt.',
            'Le mode avancé ou un outil en ligne de commande échoue : le bac à sable échoue parfois à cause de la connexion ou de limites de ressources, et Noureon réessaie seul ; s’il échoue encore, reformulez ou réduisez la taille des fichiers.',
            'Un fichier ou une présentation semble incorrect : vérifiez-le dans l’aperçu ; demandez au modèle d’ajuster la mise en page, ou activez le contrôle visuel pour qu’un modèle le vérifie.',
            'La page se comporte bizarrement : rechargez-la et, au besoin, videz le cache de ce site avant de la recharger ; si cela persiste, signalez-le.'
          ]
        ]
      },
      {
        id: 'contact',
        h: '17. Nous contacter et signaler un problème',
        blocks: [
          [
            'E-mail : support@noureon.com, pour les questions de compte, connexion, synchronisation, courrier, données et usage.',
            'Merci d’indiquer : votre navigateur et votre appareil (par exemple iPhone Safari 18), le modèle ou le fournisseur utilisé, le moment, ce que vous avez fait, et une capture d’écran ou l’erreur de la console.',
            'N’envoyez jamais de clés API, de mots de passe de synchronisation, de données de récupération ni d’identifiants de connexion.',
            'Retours : le formulaire de retour des réglages n’est envoyé que si l’exploitant a configuré un point de réception ; les propositions de Noura vont aux développeurs de la même façon.',
            'Compte X officiel : @NoureonAi (https://x.com/NoureonAi).',
            'Code source et tickets : https://github.com/NHZallen/Noureon ; vous pouvez y signaler des problèmes ou faire des suggestions.'
          ]
        ]
      },
      {
        id: 'opensource',
        h: '18. Open source et logiciels tiers',
        blocks: [
          'Le code source de Noureon est public sur GitHub sous licence MIT ; vous pouvez le lire ligne à ligne ou l’héberger vous-même. Si vous l’hébergez, ne versez jamais de vraies clés de fournisseur, identifiants SMTP, clés de service Supabase ou autres secrets dans le dépôt ; utilisez des variables d’environnement.',
          'Noureon utilise beaucoup de logiciels tiers (par exemple Python et ses bibliothèques dans le bac à sable, les outils en ligne de commande et les bibliothèques de l’application), chacun sous sa propre licence ; la liste complète est accessible par le lien « Logiciels tiers et licences » de la page Extensions.'
        ]
      }
    ]
  },

  terms: {
    title: 'Conditions d’utilisation',
    updated: 'Dernière mise à jour : 10 octobre 2026 (à partir de Noureon 18.4.0)',
    intro: [
      'Bienvenue sur Noureon. Ces conditions fixent les droits et devoirs des deux parties quand vous utilisez le service Noureon sur noureon.com (« le service »). En utilisant le service, vous confirmez avoir lu et accepté ces conditions et la Politique de confidentialité ; si vous n’êtes pas d’accord, n’utilisez pas le service.',
      'Ces conditions sont proposées par l’équipe qui exploite Noureon (« nous »). Le code source de Noureon est publié séparément sous licence MIT ; ces conditions régissent le service que nous exploitons et ne changent pas les droits que cette licence open source vous donne.'
    ],
    sections: [
      {
        id: 'service',
        h: '1. Ce qu’est le service',
        blocks: [
          'Noureon est un espace de travail IA : avec vos propres clés API, vous utilisez les modèles de plusieurs fournisseurs dans une seule interface, et il offre le Conseil des modèles, la recherche approfondie, la recherche web, l’analyse de pièces jointes, la création de fichiers et de présentations, la génération d’images, le mode avancé (un bac à sable Python), des extensions (compétences, outils en ligne de commande et connecteurs), des Nouras, des dossiers et une recherche, la mémoire, l’import et l’export, le transfert d’appareil à appareil, l’installation en PWA, ainsi que la synchronisation cloud et l’exécution sur le serveur, facultatives.',
          'Un fait important : Noureon ne fournit ni ne revend l’accès à un modèle ni son usage. Les modèles sont fournis par les fournisseurs tiers d’IA et de recherche que vous choisissez, et vous réglez le coût directement avec eux.'
        ]
      },
      {
        id: 'accounts',
        h: '2. Comptes et responsabilité des données',
        blocks: [
          [
            'Vous pouvez n’utiliser qu’un compte local (ses données restent dans ce navigateur) ou lier un e-mail ou un compte Google pour utiliser un compte cloud. Fournissez des informations exactes et assumez ce qui se passe sous votre compte.',
            'Gardez vous-même en sécurité votre mot de passe de connexion, votre mot de passe de synchronisation, vos données de récupération et vos clés API. Une fois un mot de passe de synchronisation effacé ou perdu, les données chiffrées existantes peuvent ne plus être déchiffrables et nous ne pouvons pas les restaurer pour vous.',
            'Local d’abord signifie que votre appareil contrôle les données, et aussi que les sauvegardes sont votre responsabilité : effacer les données du navigateur ou changer d’appareil ou de navigateur peut faire disparaître les données locales ; exportez régulièrement une sauvegarde.',
            'Vous ne pouvez pas transférer votre compte à une autre personne ni créer des comptes en masse par automatisation.',
            'Un compte est destiné à une personne ; si vous l’utilisez pour une organisation, assurez-vous d’y être autorisé.'
          ]
        ]
      },
      {
        id: 'content',
        h: '3. Votre contenu et vos droits',
        blocks: [
          [
            'Les requêtes que vous saisissez, les fichiers que vous importez, les Nouras, compétences et souvenirs que vous créez et les résultats que vous obtenez vous appartiennent, ou appartiennent à leurs titulaires d’origine ; nous ne prétendons pas en être propriétaires.',
            'Vous nous autorisez à traiter ce contenu dans la mesure nécessaire pour fournir les fonctions que vous utilisez, par exemple l’enregistrer dans votre espace cloud, l’envoyer au fournisseur choisi, l’exécuter dans le bac à sable, créer des fichiers ou des résumés. Nous n’utilisons pas votre contenu à d’autres fins et ne vendons pas de données personnelles (voir la Politique de confidentialité).',
            'Vous devez vous assurer d’avoir le droit d’utiliser ce que vous importez ou nous demandez de traiter (y compris les œuvres d’autrui, les données personnelles et les informations confidentielles) et vous en assumez les conséquences.',
            'Les résultats de l’IA peuvent ressembler à ce que d’autres reçoivent ; nous ne promettons pas qu’un résultat soit original ni qu’il ne porte pas atteinte aux droits de tiers.'
          ]
        ]
      },
      {
        id: 'ai',
        h: '4. Limites des réponses de l’IA',
        blocks: [
          [
            'Les réponses de l’IA, rapports de recherche approfondie, conclusions du conseil, fichiers, images et codes générés peuvent être faux, incomplets, périmés, biaisés ou inadaptés à un usage. Les sources citées peuvent aussi être mal comprises ou ne plus exister.',
            'Ne les prenez pas pour seule base de décisions médicales, juridiques, financières, de sécurité, de santé mentale ou d’autres décisions à haut risque ; faites confirmer les points importants par un professionnel qualifié. Les Nouras liés à la santé mentale de Noureon ne sont pas des professionnels humains et ne font pas de diagnostic ; en cas d’urgence, contactez les services d’urgence locaux.',
            'L’accord de plusieurs modèles ne rend rien correct, et les contrôles automatiques comme le contrôle visuel ne garantissent pas l’absence d’erreurs. Vérifiez vous-même chaque résultat, surtout avant de le publier, le remettre ou l’exécuter.',
            'Vous décidez d’utiliser ou non un résultat de l’IA et vous êtes responsable de ce qui en découle.'
          ]
        ]
      },
      {
        id: 'providers',
        h: '5. Fournisseurs, clés et coûts',
        blocks: [
          [
            'Utiliser le service suppose que vous obteniez des clés API auprès de fournisseurs tiers (par exemple Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish) et respectiez les conditions d’utilisation, politiques d’usage et politiques de confidentialité de chacun. Ce que vous envoyez est traité selon leurs règles, que nous ne contrôlons pas ; nous ne sommes pas responsables de la qualité, de la disponibilité, des politiques de contenu ni des changements de prix de leurs services.',
            'Tous les coûts de modèles et de recherche vous sont facturés par les fournisseurs. Surveillez vous-même votre crédit et votre facturation, et nous vous conseillons de fixer une limite d’usage chez le fournisseur.',
            'Quand le serveur produit une réponse, votre clé est conservée chiffrée un court moment et utilisée pour appeler le fournisseur en votre nom afin de terminer cette réponse (voir la Politique de confidentialité pour la durée). Si le serveur redémarre pendant une image ou la synthèse d’un conseil, une requête peut être renvoyée et le fournisseur peut facturer deux fois ; nous ne remboursons pas ces coûts.',
            'Le service peut aussi utiliser d’autres infrastructures tierces, par exemple Supabase (comptes et stockage de base de données), Cloudflare (contrôles anti-robot), GitHub (programmes et icônes des outils en ligne de commande) et Vercel (hébergement web).'
          ]
        ]
      },
      {
        id: 'server',
        h: '6. Exécution sur le serveur et bac à sable',
        blocks: [
          [
            'Les réponses sont produites par le serveur par défaut afin de continuer après la fermeture de la page. Vous pouvez à tout moment passer à une production sur votre seul appareil dans Réglages → Confidentialité.',
            'Le serveur et le bac à sable ont des limites, pour garder le service stable : une réponse dure 2 heures au plus, 5 à la fois par personne, 10 nouvelles par minute, des requêtes jusqu’à 25 Mo, une recherche approfondie jusqu’à environ 26 heures, un appel de modèle jusqu’à 30 minutes, et un stockage cloud jusqu’à 500 Mo par personne. Les limites peuvent changer selon l’état du service.',
            'Nous ne promettons pas que chaque exécution réussira ni se terminera dans un délai donné. Le serveur peut redémarrer et un fournisseur peut échouer ; le système essaie de réessayer ou de reprendre à un point de contrôle, mais l’échec reste possible.',
            'Le code du bac à sable s’exécute dans un conteneur isolé sans réseau, supprimé à la fin de la réponse. Vous ne devez pas tenter de sortir du bac à sable, d’atteindre d’autres utilisateurs ou le réseau interne, ni l’utiliser pour consommer des ressources de calcul excessives.'
          ]
        ]
      },
      {
        id: 'extensions',
        h: '7. Compétences, outils en ligne de commande, connecteurs et code',
        blocks: [
          [
            'Les compétences que vous ajoutez vous-même (y compris les notes et scripts d’un zip) relèvent de votre responsabilité. Assurez-vous d’avoir le droit d’en utiliser le contenu et qu’elles ne contiennent aucun code malveillant. Un script ne s’exécute que si le modèle l’exécute explicitement, dans le bac à sable.',
            'Les outils en ligne de commande utilisent les connexions et identifiants que vous fournissez. Vous êtes responsable du respect des conditions d’utilisation, des règles robots et des règles de droit d’auteur des sites auxquels ils se connectent, et de ne télécharger, lire ou publier que ce que vous avez le droit d’utiliser.',
            'Les connexions aux sites sont traitées selon les règles que vous fixez (autoriser, demander, refuser). Vous êtes responsable des connexions que vous autorisez ou confirmez.',
            'N’utilisez pas les outils ou compétences pour des actes illégaux, pour contourner des accès payants ou des contrôles d’accès, pour porter atteinte à la vie privée d’autrui, envoyer du spam, attaquer d’autres systèmes ou collecter en masse contre les règles d’un site.',
            'Les outils en ligne de commande et les logiciels du bac à sable sont des logiciels tiers, chacun avec sa licence et son exclusion de garantie ; nous les obtenons depuis la publication officielle et vérifions l’empreinte, mais nous ne promettons pas qu’ils soient exempts de défauts ou de failles.',
            'N’utilisez que vos propres comptes pour les identifiants sécurisés que vous enregistrez (par exemple des cookies de connexion) ; vous pouvez les consulter, les remplacer ou les supprimer à tout moment.',
            'Les connecteurs agissent sur vos propres comptes dans d’autres services (pour l’instant Notion et Linear). Ce qu’ils peuvent faire dépend de ce que vous autorisez dans les réglages des outils et de ce que la connexion au service permet ; vous êtes responsable de ce que vous autorisez ou confirmez, y compris les modifications et suppressions faites dans ces services, et du respect de leurs conditions d’utilisation. Ce qu’un service renvoie échappe à notre contrôle et le modèle peut se tromper ou être induit en erreur par ce contenu : examinez un outil qui modifie ou supprime des données avant de l’autoriser.'
          ]
        ]
      },
      {
        id: 'acceptable',
        h: '8. Comportements interdits',
        blocks: [
          'En utilisant le service, vous ne devez pas :',
          [
            'enfreindre la loi, ou demander des résultats qui aident à l’enfreindre.',
            'porter atteinte à la propriété intellectuelle, à la vie privée, à la réputation ou à d’autres droits de quiconque, ni traiter sans consentement les données personnelles d’autrui.',
            'créer ou diffuser des logiciels malveillants, des fraudes, de l’hameçonnage, du harcèlement, de la haine, des menaces de violence, ou des contenus sexuels impliquant des enfants.',
            'utiliser le service pour nuire à autrui ou pour créer de fausses identités ou informations qui trompent.',
            'attaquer, sonder ou perturber le service, ses serveurs, son système de comptes ou le bac à sable, ni tenter de contourner les limites de débit, la vérification et les mesures de sécurité.',
            'accéder au service par automatisation au-delà d’un usage normal, ni consommer des ressources au détriment des autres utilisateurs.',
            'enfreindre les conditions et politiques d’usage des fournisseurs tiers que vous utilisez.'
          ],
          'Si vous le faites, nous pouvons limiter ou suspendre votre accès, retirer les contenus concernés et, si nécessaire, coopérer aux enquêtes comme la loi l’exige.'
        ]
      },
      {
        id: 'ip',
        h: '9. Propriété intellectuelle et open source',
        blocks: [
          [
            'Le code source de Noureon est publié sous licence MIT ; voir LICENSE sur GitHub. Vous pouvez utiliser, modifier et distribuer le code selon cette licence.',
            'Les logiciels tiers utilisés par Noureon relèvent de leurs propres licences ; la liste est sur la page Extensions.',
            'N’utilisez pas le nom et le logo de Noureon pour laisser entendre que votre produit ou service est fourni, approuvé ou validé par nous.'
          ]
        ]
      },
      {
        id: 'privacy',
        h: '10. Confidentialité',
        blocks: [
          'La façon dont nous traitons vos données est décrite dans la Politique de confidentialité, qui fait partie de ces conditions. En bref : local d’abord par défaut ; ce que vous envoyez va aux fournisseurs que vous choisissez ; si vous choisissez la synchronisation cloud ou l’exécution sur le serveur, les données nécessaires sont stockées sur nos serveurs ou y transitent ; nous ne vendons pas de données personnelles et n’avons ni publicité intégrée ni suivi inter-sites.'
        ]
      },
      {
        id: 'changes',
        h: '11. Modification, interruption et fin du service',
        blocks: [
          [
            'Le service est en développement continu : les fonctions, les limites, les fournisseurs et les modèles pris en charge peuvent être ajoutés, modifiés ou retirés, et le service peut être interrompu un temps ou définitivement. Les changements importants figurent dans l’historique des mises à jour (noureon.com/updates).',
            'Vous pouvez cesser de l’utiliser à tout moment et exporter ou supprimer vos données ; pour supprimer un compte cloud, écrivez-nous comme l’explique le Centre d’aide.',
            'Si vous enfreignez ces conditions, mettez en danger le service ou d’autres utilisateurs, ou si la loi l’exige, nous pouvons suspendre ou mettre fin à votre accès.'
          ]
        ]
      },
      {
        id: 'disclaimer',
        h: '12. Exclusion de garantie',
        blocks: [
          'Le service est fourni « en l’état » et « selon disponibilité ». Dans toute la mesure permise par la loi, nous ne donnons aucune garantie, expresse ou implicite, que le service soit adapté à un usage, ininterrompu, sans erreur, sûr, exact, complet ou non contrefaisant. Cela vaut tout particulièrement pour les résultats de l’IA et les services des fournisseurs tiers.'
        ]
      },
      {
        id: 'liability',
        h: '13. Limitation de responsabilité',
        blocks: [
          [
            'Dans toute la mesure permise par la loi, nous ne sommes pas responsables des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs résultant de l’utilisation ou de l’impossibilité d’utiliser le service, y compris la perte de données, la perte de profit, les frais des fournisseurs et les pertes dues à la confiance accordée à un résultat de l’IA.',
            'Dans toute la mesure permise par la loi, notre responsabilité totale envers vous est limitée au montant que vous nous avez payé pour le service ; comme le service ne vous facture rien actuellement, ce montant est nul.',
            'La responsabilité que la loi ne permet pas d’exclure ou de limiter (par exemple pour faute intentionnelle ou lourde, ou les droits issus du droit local de la consommation) n’est pas affectée par cet article.'
          ]
        ]
      },
      {
        id: 'update',
        h: '14. Modification de ces conditions',
        blocks: [
          'Nous pouvons modifier ces conditions. La nouvelle version est publiée sur cette page avec la date en tête mise à jour, et les changements importants figurent aussi dans l’historique des mises à jour. Si vous continuez à utiliser le service après l’entrée en vigueur d’un changement, vous acceptez les conditions modifiées ; sinon, cessez de l’utiliser.'
        ]
      },
      {
        id: 'general',
        h: '15. Divers',
        blocks: [
          [
            'Si une partie de ces conditions est jugée invalide ou inapplicable, le reste demeure en vigueur.',
            'La version en chinois traditionnel de ces conditions prévaut ; les versions dans d’autres langues sont là pour faciliter la lecture et, en cas de différence, la version en chinois traditionnel s’applique.',
            'Ces conditions ne remplacent aucun accord entre vous et un fournisseur tiers.',
            'Là où la loi locale impose autre chose, cette loi s’applique.'
          ]
        ]
      },
      {
        id: 'contact',
        h: '16. Nous contacter',
        blocks: [
          'Pour toute question sur ces conditions, écrivez à support@noureon.com (sans clés API ni mots de passe). Le compte X officiel est @NoureonAi.'
        ]
      }
    ]
  },

  privacy: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : 10 octobre 2026 (à partir de Noureon 18.4.0)',
    intro: [
      'Cette politique explique quelles données Noureon traite, où elles sont conservées, qui les reçoit, combien de temps, et quels choix vous avez. Elle couvre les flux de données par défaut et ceux qui s’ajoutent quand vous activez la synchronisation cloud, l’exécution sur le serveur, la mémoire et d’autres fonctions.',
      'En une phrase : Noureon est « local d’abord » par défaut, donc discussions, réglages et clés sont conservés dans votre navigateur ; ce que vous envoyez va aux fournisseurs d’IA et de recherche que vous choisissez ; ce n’est que si vous vous connectez à un compte cloud, activez la synchronisation ou faites produire les réponses par le serveur que les données nécessaires sont stockées sur les serveurs de Noureon ou y transitent. Nous ne vendons pas de données personnelles et n’avons ni publicité intégrée ni suivi inter-sites.',
      '« Local d’abord » ne signifie pas que chaque requête d’IA s’exécute hors ligne : pour obtenir une réponse de l’IA, votre contenu doit être envoyé au fournisseur du modèle.'
    ],
    sections: [
      {
        id: 'summary',
        h: '1. Les données en un coup d’œil',
        blocks: [
          [
            'Dans votre navigateur : discussions, dossiers et archives, réglages, Nouras, souvenirs et index local, clés API, préférences d’apparence, données du compte local.',
            'Envoyé aux fournisseurs d’IA et de recherche : vos requêtes, le contexte de la discussion, les pièces jointes, les instructions système et les options de modèle choisies (section 6).',
            'Dans le cloud de Noureon (quand vous vous connectez et synchronisez) : données de l’espace de travail (discussions, messages, dossiers, Nouras, résumés de mémoire), fichiers importés et générés, une copie chiffrée du mot de passe de synchronisation, compétences et paquets de compétences, connexions et réglages d’outils des connecteurs, identifiants sécurisés (sections 4 et 8).',
            'Transitant un temps par le serveur de Noureon (quand vous choisissez l’exécution sur le serveur) : l’historique, les instructions système et votre clé dont cette seule réponse a besoin, supprimés à la fin de la réponse (section 7).',
            'Infrastructures tierces : Supabase, Cloudflare Turnstile, GitHub, Vercel, PeerJS et d’autres (section 17).'
          ]
        ]
      },
      {
        id: 'controller',
        h: '2. Qui est responsable et comment nous contacter',
        blocks: [
          'Noureon est exploité par son équipe de développement. Pour les questions de confidentialité, de compte, de synchronisation, de courrier ou de données, écrivez à support@noureon.com, sans clés API, mots de passe de synchronisation ni données de récupération. Le compte X officiel est @NoureonAi. Quiconque héberge lui-même Noureon est le responsable du traitement de ce déploiement et doit décrire ses propres pratiques.'
        ]
      },
      {
        id: 'local',
        h: '3. Les données conservées dans votre navigateur',
        blocks: [
          [
            'Par défaut, Noureon conserve dans le stockage du navigateur (IndexedDB et localStorage) les discussions et messages, dossiers et archives, réglages de l’application, Nouras, préférences personnelles et souvenirs confirmés, l’index local et les vecteurs du rappel entre discussions, les clés API des fournisseurs, les préférences d’apparence, les informations des images générées et le profil local.',
            'localStorage garde aussi une copie de votre choix clair/sombre, pour que la page ait le bon thème à l’ouverture.',
            'Les pages publiques (Centre d’aide, Conditions d’utilisation, Politique de confidentialité, historique des mises à jour) mémorisent aussi dans localStorage la langue que vous y choisissez ; elle n’est envoyée à personne.',
            'En tant que PWA, le service worker ne met en cache que les fichiers de l’application elle-même (programmes, styles, icônes), pas vos discussions ni vos données personnelles.',
            'Les informations de connexion d’une session cloud sont conservées dans le navigateur par la bibliothèque Auth de Supabase.',
            'Effacer les données du navigateur peut supprimer l’espace de travail local ; les fichiers exportés sont conservés par vous.'
          ],
          'Noureon n’utilise ni cookies publicitaires ni cookies de suivi et n’a aucun script d’analyse tiers.'
        ]
      },
      {
        id: 'cloud',
        h: '4. Comptes et synchronisation cloud',
        blocks: [
          [
            'Modes de connexion : e-mail avec mot de passe, ou compte Google. La vérification et le courrier sont gérés par Supabase Auth ; pour la connexion par e-mail, nous traitons votre e-mail et une empreinte du mot de passe, et pour la connexion Google, nous recevons les informations de base fournies par Google (par exemple l’e-mail et le nom affiché). Nous ne voyons jamais votre mot de passe Google.',
            'L’inscription, la connexion, la récupération du mot de passe et le formulaire de retour utilisent Cloudflare Turnstile comme contrôle anti-robot ; Cloudflare voit donc des informations sur le navigateur et la connexion.',
            'Le courrier que nous envoyons ne sert qu’à l’accès et à la récupération du compte : confirmation d’inscription, réinitialisation du mot de passe (un code), lien pour un mot de passe de synchronisation oublié, et avis d’ajout d’un mode de connexion ou de changement de mot de passe.',
            'Avec la synchronisation cloud activée, Supabase conserve ce qui est nécessaire à la synchronisation entre appareils : dossiers, discussions, messages (avec leurs métadonnées), Nouras, souvenirs et résumés de mémoire, métadonnées de synchronisation, marqueurs de suppression (pierres tombales), et les fichiers que vous importez ou créez (dans Supabase Storage).',
            'Le mot de passe de synchronisation : les clés et autres contenus sensibles sont d’abord chiffrés dans le navigateur avec votre mot de passe de synchronisation avant d’entrer dans le coffre cloud ; sans mot de passe de synchronisation, les clés API des fournisseurs ne sont pas envoyées. Le mot de passe de synchronisation lui-même est conservé chiffré par une clé côté serveur, pour la récupération entre appareils et par e-mail, et la base de données n’en garde pas de texte clair. Notez que cela signifie que la récupération du mot de passe de synchronisation se fait avec l’aide du service ; il n’est pas vrai dans tous les cas que vous seul pouvez le déverrouiller.',
            'Vous pouvez choisir de ne pas vous connecter à un compte cloud ; alors aucune de ces données ne quitte votre appareil (hormis les requêtes que vous envoyez aux fournisseurs).'
          ]
        ]
      },
      {
        id: 'providers',
        h: '5. Les fournisseurs tiers que vous configurez',
        blocks: [
          [
            'Les fournisseurs utilisables comprennent Google Gemini, OpenRouter (qui transmet les requêtes aux éditeurs de modèles), NVIDIA API Catalog, et les services de recherche Tavily et TinyFish. Ne configurez que ceux que vous utilisez.',
            'Ces fournisseurs traitent vos données selon leurs propres conditions et politiques de confidentialité, y compris la journalisation, la conservation ou l’usage pour l’entraînement ; nous ne le contrôlons pas et vous conseillons de consulter les réglages de chacun.',
            'Par défaut, vos clés sont conservées dans le navigateur et le navigateur appelle directement le fournisseur, donc les requêtes ne passent pas par le serveur de Noureon ; les exceptions sont l’exécution sur le serveur que vous choisissez, et les points de proxy de ce site (voir plus bas).'
          ]
        ]
      },
      {
        id: 'sent',
        h: '6. Ce qui est envoyé aux fournisseurs',
        blocks: [
          [
            'Quand vous envoyez un message, le contenu nécessaire de la requête, le contexte de la discussion, les pièces jointes choisies et les entrées de médias générés, les instructions système (y compris vos souvenirs, le Noura utilisé et le texte complet des compétences choisies avec / ou chargées par le modèle) et les options de modèle vont au fournisseur de modèle choisi ; quand une recherche est nécessaire, les termes de recherche et les adresses collées vont au fournisseur de recherche.',
            'Le Conseil des modèles, la recherche approfondie et le contrôle visuel envoient des requêtes de même nature à chacun des modèles choisis.',
            'Les pièces jointes que certains modèles ne peuvent pas lire sont d’abord converties en paquet de texte par le modèle de traduction que vous avez réglé, puis transmises aux modèles qui en ont besoin.',
            'Vous pouvez relire le message et les pièces jointes avant l’envoi ; une fois envoyés, ils relèvent des règles du fournisseur.'
          ]
        ]
      },
      {
        id: 'server',
        h: '7. Réponses produites par le serveur de Noureon',
        blocks: [
          'Pour les utilisateurs connectés à un compte cloud, les réponses sont produites par défaut sur le serveur de Noureon, afin qu’une réponse continue quand la page est fermée. Dans Réglages → Confidentialité, vous pouvez passer à une production sur votre seul appareil.',
          [
            'Ce qui est envoyé : le navigateur envoie au serveur l’historique de la discussion, les instructions système, le modèle choisi et la clé du fournisseur (et la clé de recherche quand une recherche est utilisée) dont cette seule réponse a besoin.',
            'Conservation des clés : les clés sont conservées chiffrées, uniquement pour cette réponse, et supprimées à sa fin ; au plus 2 h 15 pour une réponse ordinaire, 30 minutes pour la génération d’image, et 27 heures pour la recherche approfondie (qui peut être mise en pause jusqu’à un jour). Elles ne sont jamais gardées longtemps, jamais écrites dans des journaux ni des messages d’erreur, et les messages d’erreur renvoyés par les fournisseurs sont d’abord purgés des clés.',
            'La réponse : le serveur écrit la réponse dans le même espace de travail cloud que l’application synchronise déjà.',
            'Les réponses qui doivent se terminer dans le navigateur (saisie vocale, appareil photo), les utilisateurs non connectés et les discussions temporaires sont toujours produits sur votre appareil et ne sont pas envoyés au serveur.',
            'Journaux d’exécution : le serveur garde une trace de chaque exécution (sans clés), pour qu’elle puisse reprendre après un redémarrage du serveur et, une fois terminée, être conservée comme trace de la requête de cette réponse jusqu’à son retrait ; la requête et les images de référence d’une image sont supprimées de la trace à la fin de l’image. Les journaux du serveur ont une ligne par événement et ne contiennent ni contenu de requête, ni clés, ni jetons ; les champs dont le nom ressemble à un secret sont masqués.',
            'Limites : 5 réponses au plus en même temps par personne, 10 nouvelles par minute, requêtes jusqu’à 25 Mo.'
          ]
        ]
      },
      {
        id: 'features',
        h: '8. Flux de données de chaque fonction',
        blocks: [
          'Fonction par fonction, voici quelles données passent où.',
          [
            'Mode avancé (Python) : exécuté par le serveur, le code écrit par le modèle et les fichiers joints vont au serveur de bac à sable de Noureon et s’exécutent dans un conteneur isolé sans réseau, à ressources limitées, supprimé à la fin de la réponse ; les fichiers créés sont enregistrés dans votre stockage cloud et listés dans la réponse, jusqu’à 500 Mo par utilisateur, et les fichiers que plus aucune discussion n’utilise sont supprimés automatiquement après environ un jour. Exécuté dans le navigateur, le code s’exécute dans une page isolée (run.noureon.com) avec Pyodide, chargé depuis jsDelivr.',
            'Recherche approfondie : le plan, les notes, les pages cherchées et lues, le rapport et l’avancement sont enregistrés dans votre espace cloud ; les pages sont lues par le serveur en votre nom ; les recherches utilisent la clé du fournisseur de recherche que vous avez réglée. Le fichier PDF, Word ou Markdown est créé au moment de l’export.',
            'Recherche web : quand un modèle ne peut pas chercher seul, le serveur rédige la requête de recherche à partir de la discussion avec le modèle choisi (avec votre propre clé), l’envoie à votre fournisseur de recherche et place les pages trouvées avant la requête comme « paquet de recherche » ; la requête, les pages et la réponse sont écrites dans votre espace cloud. Si le serveur redémarre, la recherche peut être refaite.',
            'Génération d’images : produite par le serveur, la requête, les options (format, taille, réglages avancés), les images de référence jointes et la clé OpenRouter vont au serveur en HTTPS ; le serveur demande l’image au point d’images d’OpenRouter avec votre clé et garde l’image dans votre propre espace cloud. La requête et les images de référence sont gardées avec la trace de l’exécution (sans la clé) jusqu’à la fin de l’image. Aucun aperçu n’est créé. Si le serveur redémarre en route, la requête peut être renvoyée et votre compte OpenRouter peut être facturé deux fois.',
            'Conseil des modèles : tenu par le serveur, le navigateur envoie l’historique, votre message et vos pièces jointes, les membres et le modèle de synthèse, ce qu’il faut dire à chaque type d’appel (y compris instructions système, mémoire et Nouras) et les clés de fournisseurs utilisées (et les clés de recherche si le conseil cherche). Le serveur interroge chaque modèle avec votre clé ; ce que les membres terminés ont répondu est gardé avec l’exécution pour qu’un redémarrage ne les réinterroge pas, et supprimé à la fin du conseil ; la synthèse est refaite après un redémarrage, donc le fournisseur du modèle de synthèse peut facturer deux fois. Chaque appel de modèle dure au plus 30 minutes.',
            'Contrôle visuel : quand le contrôle automatique est activé et qu’une réponse produit une présentation, le serveur dessine les diapositives en images, les montre au modèle choisi avec votre propre clé et écrit dans la discussion toute réponse corrigée ; les images ne sont pas conservées.',
            'Le modèle de jugement : avec une clé OpenRouter, le texte de chaque message (avec de brefs extraits des deux messages précédents, l’indication d’un fichier joint, et les noms et descriptions des outils en ligne de commande que vous laissez le modèle utiliser seul) est envoyé depuis le navigateur à l’API Decisions d’OpenRouter, où un petit modèle de jugement décide si le message nécessite une recherche web, un fichier téléchargeable, un graphique ou un outil en ligne de commande. Votre propre clé OpenRouter est utilisée et Noureon n’en garde rien ; les discussions d’images ne sont pas envoyées. Sans clé, avec un appel échoué ou dépassant une seconde, l’application décide avec ses propres listes de mots ; après deux échecs de suite, il n’est plus tenté pendant dix minutes. Il n’y a pas d’interrupteur séparé, et choisir « seulement sur mon appareil » ne le désactive pas, car l’appel est fait par le navigateur.',
            'Compétences : les compétences collées sont conservées dans votre propre compte cloud (vous seul pouvez les lire et les modifier ; le serveur les lit avec son rôle de service) ; un paquet zip de compétence est conservé dans un bucket privé, dans un dossier que vous seul pouvez lire et modifier, et sa liste de fichiers dans la ligne de la compétence. Quand vous choisissez une compétence avec /, ou que le modèle décide d’en charger une, le texte complet part avec le message vers le fournisseur choisi (et passe par le serveur quand c’est lui qui produit la réponse, qui ne lit que celle utilisée). Quand le modèle lit un fichier texte d’une compétence (20 000 caractères au plus, 10 fichiers au plus par réponse), le contenu va au fournisseur de la même façon. Une compétence ni demandée ni chargée n’est pas envoyée. Quand vous supprimez une compétence, elle est supprimée avec son zip ; un zip sur lequel plus aucune compétence ne pointe est retiré par le nettoyage quotidien du serveur.',
            'Outils en ligne de commande : la liste des outils ajoutés est conservée dans vos réglages (et synchronisée avec eux). Un outil ne s’exécute que dans un conteneur isolé du serveur de bac à sable ; la commande écrite par le modèle et les fichiers de la discussion sont traités comme ci-dessus ; le programme de l’outil est téléchargé par l’hôte du bac à sable depuis sa publication officielle (GitHub) et vérifié par empreinte. La page Extensions charge l’icône de chaque projet depuis GitHub, qui voit donc cette requête.',
            'Connexions aux sites : quand un outil a besoin d’Internet (télécharger une vidéo, lire un réseau social, installer son propre paquet Python), il ne peut l’atteindre que par le proxy de filtrage de l’hôte du bac à sable. Le proxy décide selon vos règles dans Réglages → Autorisations (autoriser, demander ou refuser ; pypi.org, files.pythonhosted.org, registry.npmjs.org, github.com et deux hôtes de fichiers GitHub sont d’abord autorisés) ; un site sans règle est demandé dans la discussion, et l’absence de réponse en 10 minutes vaut refus. Le proxy n’ouvre que les ports 80 et 443, résout lui-même le site et refuse toute adresse interne au serveur (la machine elle-même, réseaux privés et de pods, adresses lien-local et de métadonnées, et sa propre adresse publique), quelles que soient les règles. Il voit le nom du site et le port, jamais la page ni ce qui est envoyé, et journalise le nom du site et le port avec la décision (sans adresse de page ni contenu). Vos règles sont conservées dans vos réglages (et synchronisées avec eux).',
            'Identifiants sécurisés : un identifiant que vous ajoutez pour un outil (par exemple le cookie de connexion d’un compte) est conservé chiffré en AES-256-GCM sur le serveur, sous une clé maîtresse qui n’existe que dans l’environnement du serveur et liée à vous et au nom de l’identifiant, dans une table que seul le serveur peut lire. Il n’est mis dans l’environnement de l’outil (ou dans le fichier de connexion que l’outil enregistrerait lui-même, pour une seule commande) que pendant l’exécution de votre propre outil ; ce que la commande affiche est purgé de l’identifiant avant que le modèle ou la page ne le voie, et le modèle ne reçoit jamais la valeur. Vous pouvez le consulter, le remplacer ou le supprimer dans Réglages → Autorisations ; il est supprimé quand vous le supprimez ou supprimez le compte.',
            'Connecteurs : quand vous en connectez un (pour l’instant Notion et Linear), vous vous connectez sur la page du service lui-même (Noureon ne voit jamais votre mot de passe) ; le serveur conserve le jeton d’accès et le jeton de renouvellement chiffrés en AES-256-GCM, sous une clé maîtresse qui n’existe que dans l’environnement du serveur et liée à vous et au connecteur, dans une table que seul le serveur peut lire, et ne les donne jamais au navigateur ni au modèle. Le serveur conserve aussi la liste des outils du service et ce que vous autorisez pour chaque outil (autoriser, demander ou refuser). Les connecteurs ne servent que dans les réponses faites par le serveur, pas dans les discussions temporaires. Quand le modèle utilise un outil, le serveur appelle le service avec votre jeton et envoie ce que le service renvoie (par exemple le contenu d’une page ou d’un ticket) au fournisseur de modèle que vous avez choisi, comme partie de la discussion ; un outil réglé sur demander montre d’abord ses paramètres exacts dans une carte. Une réponse fait au plus 30 appels à des services, et un résultat est coupé à 30 000 caractères. La déconnexion révoque le jeton auprès du service quand il le permet et supprime tout ce qui est conservé ici. La page Extensions, la carte de confirmation et les réglages chargent le logo de chaque connecteur depuis GitHub, qui voit donc cette requête.',
            'Icônes et noms des sources citées : à côté d’une source dans une réponse s’affichent la petite icône et le nom du site. Le serveur de Noureon les récupère (en lisant le balisage de la page du site, sites publics seulement, avec limite de taille et de temps et contrôle de chaque redirection), de sorte que les sites que vous avez consultés restent entre vous et le serveur de Noureon et qu’aucun service d’icônes tiers n’est sollicité.',
            'Retours et propositions de Noura : ces formulaires sont facultatifs et n’envoient que les champs remplis, uniquement via le proxy de même origine de ce site (/api/google-form-submit, qui exige un contrôle Turnstile) ; si l’exploitant n’a pas défini de point de réception, le proxy ne transmet rien. Ce qui est envoyé va au Google Form configuré par l’exploitant.'
          ]
        ]
      },
      {
        id: 'memory',
        h: '9. Mémoire et rappel entre discussions',
        blocks: [
          [
            'Mémoire automatique : activée, le navigateur utilise votre clé Gemini pour transformer les derniers tours d’une discussion, les sujets et les pièces jointes fournies en résumés et en préférences personnelles possibles (avec un modèle Gemini léger) ; les résumés et souvenirs confirmés sont conservés dans votre espace de travail, et quand vous êtes connecté et synchronisé, souvenirs et résumés sont synchronisés vers le cloud. Vous pouvez à tout moment consulter, remplacer ou supprimer chacun, et désactiver la mémoire automatique n’arrête que les nouveaux souvenirs.',
            'Rappel entre discussions : demande votre consentement explicite. Une fois donné, chaque question est envoyée à Gemini Embedding 2 pour obtenir un vecteur et un index local de l’appareil trouve jusqu’à trois résumés pertinents, qui font partie de la requête envoyée au fournisseur de modèle choisi. L’état du consentement suit le compte sur tous les appareils, mais vecteurs et index ne sont pas synchronisés : chaque appareil construit le sien. Sans consentement, les discussions antérieures ne sont ni cherchées ni envoyées et Embedding n’est pas appelé.',
            'Mémoire des pièces jointes : images, vidéos, audios et documents peuvent être résumés en points clés via la fonction de fichiers de Gemini quand la mémoire est construite.',
            'Vous pouvez activer ou désactiver ces fonctions dans les réglages, vérifier ou optimiser l’index et exporter les préférences personnelles confirmées.'
          ]
        ]
      },
      {
        id: 'voice',
        h: '10. Saisie vocale, appareil photo et micro',
        blocks: [
          [
            'La saisie vocale est transformée en texte par votre navigateur, qui peut transmettre l’audio à votre système d’exploitation ou à un service de reconnaissance vocale en ligne ; Noureon ne garde pas d’enregistrement à part, et la forme d’onde est dessinée en direct sur votre appareil. Une explication est affichée, et votre accord demandé, avant la première utilisation.',
            'L’appareil photo et le micro ne sont utilisés qu’après que vous avez appuyé sur le bouton correspondant et accepté la demande d’autorisation du navigateur ; une photo prise est la pièce jointe que vous ajoutez et suit les règles des pièces jointes.'
          ]
        ]
      },
      {
        id: 'p2p',
        h: '11. Transfert d’appareil à appareil',
        blocks: [
          'Le transfert d’appareil à appareil utilise PeerJS : son serveur d’appairage public (0.peerjs.com) sert seulement à ce que deux appareils se trouvent, avec un code à 8 caractères ou un QR code. Une fois connectés, les éléments choisis (par exemple discussions, Nouras, réglages) vont directement entre les deux appareils sans passer par les serveurs de Noureon ni y être conservés. N’appairez que des appareils de confiance et vérifiez les éléments que vous allez envoyer.'
        ]
      },
      {
        id: 'logs',
        h: '12. Journaux, sécurité et limites de débit',
        blocks: [
          [
            'Les journaux de nos serveurs ont une ligne par événement et ne contiennent que des champs choisis un par un ; ni contenu de requête, ni clés, ni jetons, et les champs dont le nom ressemble à un secret sont masqués.',
            'Pour la sécurité et la stabilité, le serveur a des limites de débit, comptées par compte et conservées seulement dans la mémoire du serveur.',
            'Tout le trafic vers les serveurs de Noureon utilise HTTPS ; les clés et identifiants sur le serveur sont stockés chiffrés.',
            'Le site a une politique de sécurité de contenu (CSP) qui limite d’où la page peut charger et vers où elle peut se connecter.',
            'Le bac à sable a des limites de mémoire et de CPU, et le conteneur est supprimé à la fin de la réponse.'
          ]
        ]
      },
      {
        id: 'analytics',
        h: '13. Analyse, publicité et suivi',
        blocks: [
          'Noureon n’a ni analyse intégrée, ni suivi publicitaire, ni scripts de suivi inter-sites, et ne vend pas de données personnelles. La page d’accueil avant la connexion et les pages publiques (Conditions d’utilisation, Politique de confidentialité, historique des mises à jour) n’ont pas non plus de scripts d’analyse. Les fournisseurs qui hébergent le site et les serveurs traitent des informations de connexion (par exemple des adresses IP et des journaux de requêtes) pour délivrer les pages et maintenir le service. Quiconque héberge lui-même Noureon et ajoute de l’analyse doit le décrire séparément.'
        ]
      },
      {
        id: 'retention',
        h: '14. Durée de conservation et suppression',
        blocks: [
          [
            'Données du navigateur : jusqu’à ce que vous les supprimiez ou effaciez les données du navigateur.',
            'L’espace de travail cloud : jusqu’à ce que vous le supprimiez ou supprimiez le compte ; connecté et synchronisé, suppressions et restaurations se synchronisent vers le cloud (avec des marqueurs de suppression). Les éléments de la corbeille peuvent être restaurés ou supprimés définitivement.',
            'Clés conservées temporairement sur le serveur : au plus 2 h 15 pour une réponse ordinaire, 30 minutes pour une image, 27 heures pour une recherche approfondie ; en général supprimées à la fin de la réponse.',
            'Conteneurs de bac à sable et contenu en mémoire : supprimés à la fin de la réponse.',
            'Fichiers cloud : les fichiers que plus aucune discussion n’utilise sont supprimés automatiquement après environ un jour ; le zip d’une compétence est supprimé avec la compétence, et un zip sur lequel aucune compétence ne pointe est retiré par le nettoyage quotidien.',
            'Identifiants sécurisés : jusqu’à ce que vous les supprimiez ou supprimiez le compte.',
            'Connexions des connecteurs : jusqu’à ce que vous vous déconnectiez (le jeton est alors révoqué auprès du service quand il le permet, et supprimé ici) ou supprimiez le compte.',
            'Journaux du serveur : seulement des enregistrements d’événements sans contenu, conservés selon les besoins d’exploitation. Les traces d’exécution (sans clés) sont conservées jusqu’à leur retrait ; la requête et les images de référence d’une image sont supprimées à la fin de l’image.',
            'Courriers adressés au support : conservés pour traiter votre question et, au besoin, supprimés à votre demande.'
          ]
        ]
      },
      {
        id: 'rights',
        h: '15. Vos choix et vos droits',
        blocks: [
          [
            'Ne vous connectez pas à un compte cloud, et aucune donnée d’espace de travail ne quitte votre appareil (hormis les requêtes que vous envoyez aux fournisseurs).',
            'Dans Réglages → Confidentialité, choisissez de produire les réponses sur votre seul appareil, et l’historique et les clés ne sont pas envoyés à nos serveurs.',
            'Désactivez la mémoire automatique et le rappel entre discussions pour arrêter ces flux de données.',
            'Exportez, importez, supprimez, restaurez ou supprimez définitivement vos données à tout moment ; utilisez « Effacer tous les enregistrements et données » pour vider ce navigateur.',
            'Consultez, remplacez ou supprimez vos identifiants sécurisés, vos connecteurs, vos compétences et vos règles de sites.',
            'Pour obtenir, corriger ou supprimer les données de votre compte cloud, écrivez à support@noureon.com depuis l’e-mail d’inscription ; nous répondrons dans un délai raisonnable. Selon la loi de votre lieu de résidence, vous pouvez aussi avoir des droits d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition ; écrivez-nous pour les exercer.'
          ]
        ]
      },
      {
        id: 'children',
        h: '16. Enfants et transferts internationaux',
        blocks: [
          [
            'Noureon n’est pas un service conçu pour les enfants. Les fournisseurs que vous utilisez ont aussi des règles d’âge ; respectez-les.',
            'Les fournisseurs que vous choisissez et l’infrastructure que nous utilisons peuvent se trouver dans différents pays ; les données peuvent donc être traitées hors de votre lieu de résidence.'
          ]
        ]
      },
      {
        id: 'thirdparties',
        h: '17. Les services tiers en bref',
        blocks: [
          [
            'Supabase : vérification des comptes, base de données et stockage de fichiers (pour la synchronisation cloud et l’exécution sur le serveur).',
            'Cloudflare : le contrôle anti-robot Turnstile.',
            'Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish : les fournisseurs de modèles et de recherche que vous configurez.',
            'GitHub : téléchargements et icônes des outils en ligne de commande, et code source.',
            'Notion, Linear : les services que vous connectez comme connecteurs, quand vous les connectez (chacun a ses propres conditions et sa politique de confidentialité).',
            'Vercel : hébergement et diffusion du site.',
            'jsDelivr : chargement de Python dans le navigateur (Pyodide).',
            'PeerJS : le serveur d’appairage du transfert d’appareil à appareil.',
            'Google Forms : retours et propositions de Noura (si l’exploitant le configure).',
            'Un service d’envoi d’e-mails : courriers de vérification et de récupération des comptes.',
            'Votre navigateur et votre système d’exploitation : reconnaissance vocale.'
          ],
          'Chacun de ces services a sa propre politique de confidentialité.'
        ]
      },
      {
        id: 'selfhost',
        h: '18. L’héberger vous-même',
        blocks: [
          'Si vous hébergez Noureon vous-même, ne versez jamais de vraies clés de fournisseur, identifiants SMTP, clés Resend, clés de service Supabase, URL Google Apps Script ou autres secrets dans le dépôt ; utilisez des variables d’environnement pour les réglages côté serveur, et gardez les clés de fournisseur dans les réglages locaux, sauf si vous avez un plan distinct de gestion de secrets chiffrés. Si le déploiement ajoute de l’analyse, son propriétaire doit le décrire séparément.'
        ]
      },
      {
        id: 'changes',
        h: '19. Modification de cette politique',
        blocks: [
          'Nous pouvons modifier cette politique avec l’évolution des fonctions. La nouvelle version est publiée sur cette page avec la date en tête mise à jour, et les changements importants figurent aussi dans l’historique des mises à jour (noureon.com/updates). PRIVACY.md sur GitHub est mis à jour en même temps.'
        ]
      },
      {
        id: 'contact',
        h: '20. Nous contacter',
        blocks: [
          'Pour les questions de confidentialité, de compte, de synchronisation, de courrier ou de données : support@noureon.com. Merci de ne pas joindre de clés API, de mots de passe de synchronisation ni de données de récupération.'
        ]
      }
    ]
  }
};
