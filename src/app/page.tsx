"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { BrainDumpModal } from "@/components/BrainDumpModal";
import { FocusModeView } from "@/components/FocusModeView";

// Modules
import { DashboardModule } from "@/components/modules/DashboardModule";
import { EmailsModule } from "@/components/modules/EmailsModule";
import { DressingModule } from "@/components/modules/DressingModule";
import { SanteModule } from "@/components/modules/SanteModule";
import { CoursesModule } from "@/components/modules/CoursesModule";
import { SportModule } from "@/components/modules/SportModule";
import { LitigesModule } from "@/components/modules/LitigesModule";
import { ProjetsModule } from "@/components/modules/ProjetsModule";
import { CultureModule } from "@/components/modules/CultureModule";
import { ParametresModule } from "@/components/modules/ParametresModule";

import {
  initialUserProfile,
  initialEmails,
  initialClothes,
  initialOutfits,
  initialHealthData,
  initialPantry,
  initialRecipes,
  initialWorkouts,
  initialDisputes,
  initialProjects,
} from "@/lib/initialData";
import { ModuleType, EnergyLevel, UserProfile, PantryItem } from "@/types";

export default function Home() {
  const [currentModule, setCurrentModule] = useState<ModuleType>("dashboard");
  const [user, setUser] = useState<UserProfile>(initialUserProfile);
  const [emails, setEmails] = useState(initialEmails);
  const [clothes, setClothes] = useState(initialClothes);
  const [outfits, setOutfits] = useState(initialOutfits);
  const [health, setHealth] = useState(initialHealthData);
  const [pantry, setPantry] = useState(initialPantry);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [workouts, setWorkouts] = useState(initialWorkouts);
  const [disputes, setDisputes] = useState(initialDisputes);
  const [projects, setProjects] = useState(initialProjects);

  const [isBrainDumpOpen, setIsBrainDumpOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handlers
  const handleSetEnergy = (energy: EnergyLevel) => {
    setUser((prev) => ({ ...prev, energyToday: energy }));
    showToast(`Énergie : ${energy === "low" ? "Basse" : energy === "medium" ? "Modérée" : "Haute"}`);
  };

  const handleToggleFocusMode = () => {
    setUser((prev) => ({ ...prev, focusMode: !prev.focusMode }));
  };

  const handleApproveEmail = (id: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "approved" } : e))
    );
    showToast("Email validé et envoyé !");
  };

  const handleUpdateEmailDraft = (id: string, newReply: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, suggestedReply: newReply } : e))
    );
    showToast("Brouillon mis à jour.");
  };

  const handleToggleSupplement = (id: string) => {
    setHealth((prev) => ({
      ...prev,
      supplements: prev.supplements.map((s) =>
        s.id === id ? { ...s, taken: !s.taken } : s
      ),
    }));
  };

  const handleToggleProjectTask = (projectId: string, taskId: string) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        const updatedTasks = proj.tasks.map((task) =>
          task.id === taskId ? { ...task, completed: !task.completed } : task
        );
        return { ...proj, tasks: updatedTasks };
      })
    );
    showToast("Étape du projet mise à jour !");
  };

  const handleAddThought = (thought: string, moduleName: string) => {
    showToast(`Pensée classée dans « ${moduleName} »`);
  };

  const handleAddPantryItem = (item: Partial<PantryItem>) => {
    const newItem: PantryItem = {
      id: `p-${Date.now()}`,
      name: item.name || "Nouvel aliment",
      category: item.category || "frais",
      quantity: item.quantity || "1",
      status: "disponible",
      yukaScore: 85,
      yukaVerdict: "Excellent",
    };
    setPantry((prev) => [newItem, ...prev]);
    showToast(`« ${newItem.name} » ajouté au frigo`);
  };

  const pendingEmailsCount = emails.filter((e) => e.status === "pending_review").length;
  const urgentDisputesCount = disputes.filter((d) => d.status === "action_requise").length;

  return (
    <div className="min-h-screen w-full bg-[#FAF8F2] flex flex-col md:flex-row font-sans selection:bg-[#f7b5d5] selection:text-slate-900 overflow-x-hidden">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121316] text-white font-bold px-4 py-2.5 rounded-full shadow-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-[#f7da64]">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Charcoal Sidebar */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={setCurrentModule}
        pendingEmailsCount={pendingEmailsCount}
        urgentDisputesCount={urgentDisputesCount}
        energy={user.energyToday}
        onSetEnergy={handleSetEnergy}
        focusMode={user.focusMode}
        onToggleFocusMode={handleToggleFocusMode}
        onOpenBrainDump={() => setIsBrainDumpOpen(true)}
      />

      {/* Main Full-Width Stage */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full">
        {/* Top Bar Header */}
        <Header
          onSelectModule={setCurrentModule}
          pendingEmailsCount={pendingEmailsCount}
        />

        {/* Module Canvas - 100% Full Width */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 pb-10 w-full">
          {user.focusMode ? (
            <FocusModeView onExit={() => setUser({ ...user, focusMode: false })} />
          ) : (
            <div className="w-full">
              {currentModule === "dashboard" && (
                <DashboardModule
                  user={user}
                  emails={emails}
                  outfit={outfits[0]}
                  health={health}
                  recipe={recipes[0]}
                  dispute={disputes[0]}
                  project={projects[0]}
                  onNavigate={setCurrentModule}
                  onApproveEmail={handleApproveEmail}
                />
              )}

              {currentModule === "emails" && (
                <div className="w-full pt-2">
                  <EmailsModule
                    emails={emails}
                    onApprove={handleApproveEmail}
                    onUpdateDraft={handleUpdateEmailDraft}
                    signature={user.name ? `Bien cordialement,\n${user.name} DALERY` : ""}
                  />
                </div>
              )}

              {currentModule === "dressing" && (
                <div className="w-full pt-2">
                  <DressingModule
                    clothes={clothes}
                    outfits={outfits}
                    onAddClothesPhoto={() => showToast("Module photo déclenché !")}
                  />
                </div>
              )}

              {currentModule === "sante" && (
                <div className="w-full pt-2">
                  <SanteModule
                    health={health}
                    onToggleSupplement={handleToggleSupplement}
                  />
                </div>
              )}

              {currentModule === "courses" && (
                <div className="w-full pt-2">
                  <CoursesModule
                    pantry={pantry}
                    recipes={recipes}
                    onAddPantryItem={handleAddPantryItem}
                  />
                </div>
              )}

              {currentModule === "sport" && (
                <div className="w-full pt-2">
                  <SportModule
                    workouts={workouts}
                    currentEnergy={user.energyToday}
                    onSetEnergy={handleSetEnergy}
                    onWorkoutCompleted={(title, mins) => {
                      showToast(`🎉 Séance "${title}" terminée (+${mins} min d'activité) !`);
                    }}
                  />
                </div>
              )}

              {currentModule === "culture" && (
                <div className="w-full pt-2">
                  <CultureModule />
                </div>
              )}

              {currentModule === "litiges" && (
                <div className="w-full pt-2">
                  <LitigesModule disputes={disputes} />
                </div>
              )}

              {currentModule === "projets" && (
                <div className="w-full pt-2">
                  <ProjetsModule
                    projects={projects}
                    onToggleTask={handleToggleProjectTask}
                  />
                </div>
              )}

              {currentModule === "parametres" && (
                <div className="w-full pt-2">
                  <ParametresModule
                    user={user}
                    onUpdateProfile={(updated) => {
                      setUser((prev) => ({ ...prev, ...updated }));
                      showToast("Profil mis à jour !");
                    }}
                    onRefreshAllData={() => {
                      showToast("Tous vos comptes (Google, Withings, Apple, Yuka) sont synchronisés !");
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Brain Dump Modal */}
      <BrainDumpModal
        isOpen={isBrainDumpOpen}
        onClose={() => setIsBrainDumpOpen(false)}
        onAddThought={handleAddThought}
      />
    </div>
  );
}
