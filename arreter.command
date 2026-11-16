#!/bin/bash

clear
echo "========================================================"
echo "   🛑 Arrêt de Assistant perso                          "
echo "========================================================"

PID=$(lsof -ti :3000)

if [ -z "$PID" ]; then
    echo "ℹ️  Aucun serveur Assistant perso n'est actif sur le port 3000."
else
    echo "Fermeture du processus Assistant perso (PID: $PID)..."
    kill -9 $PID 2>/dev/null
    echo "✅ Assistant perso a été arrêté avec succès."
fi

echo ""
sleep 1.5

