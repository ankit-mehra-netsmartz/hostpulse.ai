import { cn } from "@/lib/utils";

type Grade = string | null | undefined;

interface GradeBadgeProps {
  grade: Grade;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const gradeConfig: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-500/20", text: "text-emerald-500", label: "Excellent" },
  B: { bg: "bg-blue-500/20", text: "text-blue-500", label: "Good" },
  C: { bg: "bg-amber-500/20", text: "text-amber-500", label: "Needs Review" },
  D: { bg: "bg-orange-500/20", text: "text-orange-500", label: "Below Average" },
  F: { bg: "bg-red-500/20", text: "text-red-500", label: "Low" },
};

const sizeConfig = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

function normalizeGrade(g: string | null | undefined): string | null {
  if (!g || g === "N/A") return g || null;
  const upper = g.toUpperCase().trim();
  if (["A", "B", "C", "D", "F"].includes(upper)) return upper;
  const base = upper.charAt(0);
  if (["A", "B", "C", "D", "F"].includes(base)) {
    if (upper.includes("+")) {
      const upgraded: Record<string, string> = { "B": "A", "C": "B", "D": "C", "F": "D" };
      return upgraded[base] || base;
    }
    if (upper.includes("-")) {
      const downgraded: Record<string, string> = { "A": "B", "B": "C", "C": "D", "D": "F" };
      return downgraded[base] || base;
    }
    return base;
  }
  return null;
}

export function GradeBadge({ grade, size = "md", className }: GradeBadgeProps) {
  const normalized = normalizeGrade(grade);
  if (!normalized) {
    return (
      <div 
        className={cn(
          "rounded-md flex items-center justify-center font-semibold bg-muted text-muted-foreground",
          sizeConfig[size],
          className
        )}
      >
        {grade === "N/A" ? "N/A" : "-"}
      </div>
    );
  }

  const config = gradeConfig[normalized] || gradeConfig.F;

  return (
    <div 
      className={cn(
        "rounded-md flex items-center justify-center font-semibold",
        config.bg,
        config.text,
        sizeConfig[size],
        className
      )}
      title={config.label}
    >
      {normalized}
    </div>
  );
}

export function GradeLegend() {
  return (
    <div className="flex items-center gap-4 text-xs flex-wrap">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
        <span className="text-muted-foreground">A-Excellent</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-blue-500" />
        <span className="text-muted-foreground">B-Good</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-amber-500" />
        <span className="text-muted-foreground">C-Needs Review</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-orange-500" />
        <span className="text-muted-foreground">D-Below Average</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-red-500" />
        <span className="text-muted-foreground">F-Low</span>
      </div>
    </div>
  );
}
