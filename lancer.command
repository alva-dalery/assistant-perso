#!/bin/bash

# Se positionner dans le dossier du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Charger l'environnement Node.js (support NVM et Homebrew)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export PATH="$HOME/.nvm/versions/node/v22.23.5/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

clear
echo "========================================================"
echo "   🌟 Assistant perso — Démarrage de votre assistant    "
echo "========================================================"
echo ""

# Vérifier si le serveur tourne déjà sur le port 3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚡ Le serveur Assistant perso est déjà actif sur le port 3000."
else
    echo "🚀 Lancement du serveur Next.js en cours..."
    npm run dev &
    SERVER_PID=$!

    # Attendre que le serveur réponde
    echo "⏳ En attente de la disponibilité de l'application..."
    for i in {1..30}; do
        if curl -s -I http://localhost:3000 | grep -q "200 OK\|308 Permanent"; then
            break
        fi
        sleep 1
    done
fi

echo ""
echo "✨ Assistant prêt ! Ouverture dans votre navigateur..."
open "http://localhost:3000"

echo ""
echo "========================================================"
echo "   Application accessible sur : http://localhost:3000"
echo "   Laissez cette fenêtre ouverte tant que vous l'utilisez."
echo "   Pour quitter : fermez cette fenêtre ou faites Ctrl + C."
echo "========================================================"
echo ""

# Si on a lancé un sous-processus, attendre
if [ ! -z "$SERVER_PID" ]; then
    trap "kill $SERVER_PID 2>/dev/null; exit" SIGINT SIGTERM EXIT
    wait $SERVER_PID
else
    # Si le serveur tournait déjà, laisser l'invite active
    read -p "Appuyez sur Entrée pour fermer cette fenêtre..."
fi

