"use client";

import { BackButton } from "@/components/dashboard/back-button";
import { workProjects } from "@/lib/data";
import { useState } from "react";

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ProjectCard({ project }: { project: typeof workProjects[number] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{project.icon}</span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
            <p className="text-xs text-muted-foreground">WIG: {project.wig}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-orange-500">{project.score}%</span>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar value={project.score} color="#f97316" />
      </div>
    </div>
  );
}

export default function PracaPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const overallScore = Math.round(
    workProjects.reduce((s, p) => s + p.score, 0) / workProjects.length
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <BackButton />

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">💼</span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Praca</h1>
            <p className="text-muted-foreground">3 projekty · Wynik łączny: {overallScore}%</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          {[{ id: "all", label: "Wszystkie" }, ...workProjects.map((p) => ({ id: p.id, label: `${p.icon} ${p.name}` }))].map(
            (tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-orange-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {tab.label}
              </button>
            )
          )}
        </div>

        {/* Project cards */}
        <div className="mt-6 space-y-4">
          {workProjects
            .filter((p) => activeTab === "all" || p.id === activeTab)
            .map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
        </div>
      </div>
    </div>
  );
}
