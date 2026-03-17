import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MagicLinkForm } from "@/components/MagicLinkForm";
import {
  BarChart3,
  Sparkles,
  TrendingUp,
  Building2,
  Shield,
  Zap,
  Tags,
  CheckSquare,
  Lightbulb,
  MessageSquare,
  Layers,
  Users,
  Bot,
  Star,
  XCircle,
  Scale,
  MessageCircle,
  Home,
  Briefcase,
  GraduationCap,
  Check,
  DollarSign,
  Activity,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export default function Landing() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [magicMessage, setMagicMessage] = useState<{
    text: string;
    variant: "success" | "warning" | "error";
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magic = params.get("magic");
    if (magic === "success") {
      setMagicMessage({
        text: "You're signed in!",
        variant: "success",
      });
    } else if (magic === "expired") {
      setMagicMessage({
        text: "This sign-in link has expired. Request a new one below.",
        variant: "warning",
      });
      setIsAuthModalOpen(true);
    } else if (magic === "invalid") {
      setMagicMessage({
        text: "Invalid sign-in link. Please request a new one.",
        variant: "error",
      });
      setIsAuthModalOpen(true);
    } else if (magic === "error") {
      setMagicMessage({
        text: "Something went wrong. Please try again.",
        variant: "error",
      });
      setIsAuthModalOpen(true);
    }
    if (magic) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function openSignup() {
    setIsAuthModalOpen(true);
  }
  function openLogin() {
    setIsAuthModalOpen(true);
  }
  function closeModal() {
    setIsAuthModalOpen(false);
  }

  function handleLoginClick() {
    window.location.href = "/auth/google";
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <div className="flex items-center gap-2">
              <a href="#" className="flex items-center gap-2">
                <img
                  src="/logo-light.png"
                  alt="HostPulse"
                  className="h-7 dark:hidden"
                />
                <img
                  src="/favicon.png"
                  alt="HostPulse"
                  className="h-7 hidden dark:block"
                />
                <span className="text-xl font-semibold dark:block hidden">
                  HostPulse
                </span>
              </a>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <a
                href="#why-hostpulse"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="nav-why"
              >
                Why HostPulse
              </a>
              <a
                href="#ai-agents"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="nav-ai-agents"
              >
                AI Agents
              </a>
              <a
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="nav-features"
              >
                Features
              </a>
              <a
                href="#who-its-for"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="nav-who-its-for"
              >
                Who It's For
              </a>
              <a
                href="#pricing"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="nav-pricing"
              >
                Pricing
              </a>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                onClick={openLogin}
                data-testid="button-login"
              >
                Sign in
              </Button>
              <Button onClick={openSignup} data-testid="button-get-started-nav">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        {magicMessage && (
          <div
            className={[
              "fixed top-16 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium shadow",
              magicMessage.variant === "success"
                ? "bg-emerald-600 text-white"
                : magicMessage.variant === "warning"
                  ? "bg-amber-500 text-white"
                  : "bg-destructive text-destructive-foreground",
            ].join(" ")}
          >
            <span>{magicMessage.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setMagicMessage(null)}
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        )}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    AI-Powered Operating System
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                    Keep Quality High,{" "}
                    <span className="text-primary">Guests Satisfied</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-lg">
                    The complete operating system for short-term rental hosts.
                    AI agents that analyze listings, fight unfair reviews,
                    challenge bad resolutions, and gather guest feedback
                    automatically.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <Button
                    size="lg"
                    onClick={openSignup}
                    data-testid="button-get-started"
                  >
                    Start Free
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    data-testid="button-learn-more"
                  >
                    <a href="#ai-agents">See AI Agents</a>
                  </Button>
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>First property free</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span>No credit card required</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="relative rounded-xl overflow-hidden border bg-card p-6 shadow-lg">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Property Overview</h3>
                      <span className="text-sm text-muted-foreground">
                        AI Analyzed
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <span className="text-3xl font-bold text-primary">
                          4.8
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">Guest Satisfaction</p>
                        <p className="text-sm text-muted-foreground">
                          Excellent performance
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                        <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                          12
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tasks
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                          8
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Themes
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-500/10 text-center">
                        <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                          45
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tags
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10">
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                      <span className="text-sm">
                        Ask Lumi: "What do guests love most?"
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="why-hostpulse" className="py-24 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mx-auto">
                <Activity className="w-4 h-4" />
                The Operating System for STR Management
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold">
                Keep Your Finger on the Pulse
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                The foundation of HostPulse is having a pulse on three things:
                your Listing, your Property, and your Guests.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-16">
              <Card className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Your Listing</h3>
                <p className="text-sm text-muted-foreground">
                  How your property appears online - photos, descriptions,
                  amenities, and pricing that attract guests.
                </p>
              </Card>
              <Card className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Your Property</h3>
                <p className="text-sm text-muted-foreground">
                  The physical space - the real experience guests have when they
                  stay with you.
                </p>
              </Card>
              <Card className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Your Guests</h3>
                <p className="text-sm text-muted-foreground">
                  The feedback they give - in conversations, public reviews, and
                  private remarks.
                </p>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold">
                  The Problem: Feedback Gets Buried
                </h3>
                <p className="text-muted-foreground">
                  Guest feedback is buried in conversation threads, public
                  reviews, and private remarks. But you're so focused on current
                  reservations and putting out fires that you rarely have time
                  to reflect on this feedback or spot the trends that need
                  attention.
                </p>
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-600 dark:text-red-400">
                        The Hidden Risk
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Most guests are understanding about small issues. But
                        that same persistent problem might annoy one guest
                        enough to leave a very negative review. A single bad
                        review can set your listing back months and cause a{" "}
                        <strong>20-30% decrease in revenue</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <h3 className="text-2xl font-bold">
                  The Solution: Automated Insights
                </h3>
                <p className="text-muted-foreground">
                  HostPulse automates the insights your guests give you. It also
                  proactively reaches out to guests for detailed feedback in
                  longer form format, then breaks that feedback into actionable
                  insights and tasks.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10">
                    <Check className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm">
                      Automatically extracts insights from every guest
                      interaction
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10">
                    <Check className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm">
                      Proactively reaches out for detailed guest feedback
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10">
                    <Check className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm">
                      Converts feedback into actionable tasks with priorities
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-16 p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                    <TrendingUp className="w-4 h-4" />
                    Measure Impact
                  </div>
                  <h3 className="text-2xl font-bold">
                    See the Results of Your Actions
                  </h3>
                  <p className="text-muted-foreground">
                    HostPulse shows the IMPACT of creating tasks from feedback
                    and completing them. Watch how addressing issues leads to
                    reduction or stabilization of that type of feedback over
                    time. No more guessing if your improvements are working.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold">Impact Tracking</h4>
                    <span className="text-xs text-muted-foreground">
                      Last 90 days
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">
                          "Check-in confusion"
                        </span>
                        <span className="text-emerald-500 font-medium">
                          -67%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">
                          "WiFi issues"
                        </span>
                        <span className="text-emerald-500 font-medium">
                          -85%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-[15%] bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">
                          "Parking unclear"
                        </span>
                        <span className="text-amber-500 font-medium">
                          Stable
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/2 bg-amber-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    Completed 3 tasks related to these themes
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="ai-agents" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mx-auto">
                <Bot className="w-4 h-4" />
                AI Agents
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold">
                Your Team of AI Specialists
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Powerful AI agents working around the clock to protect your
                business and maximize guest satisfaction
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="p-8 hover-elevate">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-7 h-7 text-white" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold">Listing Analysis</h3>
                    <p className="text-muted-foreground">
                      Deep analysis of your listings across 15+ categories
                      including photos, descriptions, amenities, reviews, and
                      guest experience. Get actionable insights to improve your
                      ratings and bookings.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        Photos
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        Reviews
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        Amenities
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        Pricing
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-8 hover-elevate">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-7 h-7 text-white" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold">Review Removal</h3>
                    <p className="text-muted-foreground">
                      Analyzes guest reviews for policy violations and assigns a
                      removal likelihood score. Writes professional removal
                      challenges, handles appeals, and drafts arbitration
                      letters if needed.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                        % Likelihood Score
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                        Challenge Writing
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                        Arbitration
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-8 hover-elevate">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Scale className="w-7 h-7 text-white" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold">
                      Resolution Reversal
                    </h3>
                    <p className="text-muted-foreground">
                      When Airbnb sides with a guest unfairly for refunds or
                      cancellations, this agent fights back. Analyzes the case,
                      writes appeals, and pursues arbitration when your rights
                      are violated.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        Case Analysis
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        Appeal Writing
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        Arbitration
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-8 hover-elevate">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-7 h-7 text-white" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold">Nudge</h3>
                    <p className="text-muted-foreground">
                      Proactively reaches out to guests via SMS for feedback on
                      their stay. Mitigates potential bad reviews while
                      gathering detailed insights. The best feedback often comes
                      from your happiest guests.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        SMS Outreach
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Review Prevention
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Feedback Collection
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section id="features" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold">
                Your Complete Property OS
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Everything you need to analyze, improve, and manage your
                short-term rentals
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Tags,
                  title: "Smart Tags",
                  description:
                    "AI automatically creates tags from guest interactions, tracking what matters most to your guests.",
                },
                {
                  icon: Layers,
                  title: "Theme Discovery",
                  description:
                    "Tags are grouped into themes to reveal patterns like cleanliness concerns or check-in issues.",
                },
                {
                  icon: CheckSquare,
                  title: "Actionable Tasks",
                  description:
                    "AI-generated tasks with prioritization to focus on improvements that drive the biggest impact.",
                },
                {
                  icon: Lightbulb,
                  title: "Ask Lumi",
                  description:
                    "Your AI research assistant (short for Illumination). Ask questions and get instant insights.",
                },
                {
                  icon: MessageSquare,
                  title: "Conversation Insights",
                  description:
                    "Analyze guest conversations to uncover patterns, common requests, and improvement opportunities.",
                },
                {
                  icon: TrendingUp,
                  title: "Performance Tracking",
                  description:
                    "Monitor trends over time and measure the impact of your improvements across all properties.",
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="group rounded-xl border bg-card p-6 hover-elevate"
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-medium">
                  <Lightbulb className="w-4 h-4" />
                  Ask Lumi
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold">
                  Your AI Research Assistant
                </h2>
                <p className="text-lg text-muted-foreground">
                  Ask Lumi (short for Illumination) is your intelligent
                  companion for exploring your property data. Ask questions in
                  plain English and get instant insights from your reviews,
                  reservations, and guest feedback.
                </p>
                <ul className="space-y-3">
                  {[
                    "What are guests saying about cleanliness?",
                    "Which properties have the best reviews?",
                    "What improvements would increase my ratings?",
                    "Show me trends in guest satisfaction over time",
                  ].map((question, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-3 h-3 text-primary" />
                      </div>
                      <span>"{question}"</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div className="rounded-xl border bg-card p-6 shadow-lg space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <Lightbulb className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Ask Lumi</h4>
                      <p className="text-sm text-muted-foreground">
                        AI Research Assistant
                      </p>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      You asked:
                    </p>
                    <p className="font-medium">
                      "What do guests love most about my properties?"
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm">
                      Based on analyzing 142 reviews across your 5 properties:
                    </p>
                    <ul className="text-sm space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">1.</span>
                        <span>
                          <strong>Location</strong> - 89% positive mentions
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">2.</span>
                        <span>
                          <strong>Cleanliness</strong> - 85% positive mentions
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">3.</span>
                        <span>
                          <strong>Communication</strong> - 82% positive mentions
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="who-its-for" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold">
                Built For Hosts Like You
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Whether you're managing your own rentals or helping others
                succeed, HostPulse is designed for you
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <Card className="p-8 text-center hover-elevate">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center mx-auto mb-6">
                  <Home className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Self Managers</h3>
                <p className="text-muted-foreground">
                  Managing your own vacation rentals? Get the same powerful AI
                  tools that big property managers use. Protect your reviews,
                  improve your listings, and maximize your income.
                </p>
              </Card>

              <Card className="p-8 text-center hover-elevate">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-6">
                  <Briefcase className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  Property Managers
                </h3>
                <p className="text-muted-foreground">
                  Managing properties for others? Scale your operations with
                  AI-powered quality control. Keep owners happy with data-driven
                  insights and protect their investment.
                </p>
              </Card>

              <Card className="p-8 text-center hover-elevate">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center mx-auto mb-6">
                  <GraduationCap className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  Coaches & Masterminds
                </h3>
                <p className="text-muted-foreground">
                  Leading an STR coaching program or mastermind? Give your
                  members deeper insights with AI analysis. Help them succeed
                  faster with data-backed recommendations.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-24 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-bold">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Start free, scale as you grow. No contracts, no hidden fees.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-2 gap-8">
                <Card className="p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-bl-lg">
                    Start Here
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-2xl font-bold">Free Forever</h3>
                      <p className="text-muted-foreground">
                        Your first property
                      </p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold">$0</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <ul className="space-y-3">
                      {[
                        "1 property included free",
                        "All AI agents included",
                        "Ask Lumi research assistant",
                        "Tags, Themes & Tasks",
                        "Team collaboration",
                        "No credit card required",
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={openSignup}
                      data-testid="button-pricing-free"
                    >
                      Get Started Free
                    </Button>
                  </div>
                </Card>

                <Card className="p-8 border-primary/50">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-2xl font-bold">Per Property</h3>
                      <p className="text-muted-foreground">
                        For additional properties
                      </p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold">$10</span>
                      <span className="text-muted-foreground">
                        /property/month
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {[
                        "First property always free",
                        "Pay only for additional properties",
                        "All features included",
                        "Month-to-month, no contract",
                        "Cancel anytime",
                        "Volume discounts available",
                      ].map((item, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full"
                      onClick={openSignup}
                      data-testid="button-pricing-pro"
                    >
                      Start Free, Add Properties Later
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="mt-12 text-center">
                <Card className="inline-block p-6 bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-4 flex-wrap justify-center">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      <span className="font-medium">100+ Properties?</span>
                    </div>
                    <p className="text-muted-foreground">
                      Contact us for volume pricing and enterprise features.
                    </p>
                    <Button variant="outline" size="sm">
                      Contact Sales
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="max-w-2xl mx-auto space-y-8">
              <h2 className="text-3xl sm:text-4xl font-bold">
                Ready to Transform Your Hosting Business?
              </h2>
              <p className="text-lg text-muted-foreground">
                Join hosts who are using HostPulse to deliver exceptional guest
                experiences, protect their reviews, and grow their revenue.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={openSignup}
                  data-testid="button-cta-get-started"
                >
                  Get Started for Free
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                No credit card required. First property is free forever.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img
                src="/logo-light.png"
                alt="HostPulse"
                className="h-6 dark:hidden"
              />
              <img
                src="/favicon.png"
                alt="HostPulse"
                className="h-6 hidden dark:block"
              />
              <span className="font-medium dark:block hidden">HostPulse</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/privacy-policy">
                <span
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  data-testid="link-privacy-policy"
                >
                  Privacy Policy
                </span>
              </Link>
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} HostPulse. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <Dialog
        open={isAuthModalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Continue to HostPulse</DialogTitle>
          </DialogHeader>
          <MagicLinkForm onGoogleLogin={handleLoginClick} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
