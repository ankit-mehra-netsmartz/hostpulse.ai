# HostPulse - AI-Powered Listing Analysis

## Overview
HostPulse is a full-stack web application that uses AI to provide short-term rental hosts with actionable insights. Its main purpose is to analyze guest reviews and best practices to optimize property listings, improve ratings, increase booking rates, and maximize revenue. The platform offers comprehensive listing optimization and AI-driven recommendations through intelligent analysis of guest interactions and property attributes. The vision is to empower hosts with data-driven decisions and streamline property management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, shadcn/ui, Tailwind CSS.
- **Backend**: Express.js, TypeScript, Node.js.
- **Database**: PostgreSQL with Drizzle ORM.
- **Monorepo**: Structured with `client/`, `server/`, and `shared/` directories.

### Key Architectural Patterns
- **Multi-Workspace Architecture**: Supports multiple property management companies with data isolation and role-based access control.
- **API Design**: RESTful API with workspace membership validation.
- **Authentication & Authorization**: Replit Auth (OpenID Connect), Passport.js, PostgreSQL-backed sessions, and role-based access control.
- **Data Scoping**: Every domain table includes a `workspaceId` for strict data separation.
- **Modular Route Architecture**: Thin orchestrator for domain-specific route modules.
- **Centralized Configuration**: Typed configuration exports.
- **Structured Logging**: Tagged context for logging.

### Core Features
- **AI-Powered Analysis**: Utilizes OpenAI (gpt-4.1-mini) for generating "Ideal Guest Profiles," category-specific analyses, and guest conversation history analysis. Includes staged listing analysis with real-time progress updates via SSE.
  - **AI-Generated Insights**: Automatically creates `tags`, groups them into `themes`, and generates actionable `tasks` with user acceptance/rejection workflows.
  - **Automated Data Sync & AI Analysis**: Fetches data, performs AI analysis on reservations in batches, generates tags with sentiment, creates or matches themes, and auto-creates tasks.
- **Property Management Integration**: Connects with platforms like Hospitable for data import and synchronization. Includes automatic OAuth token refresh (proactive background refresh every 30 min, on-demand refresh on 401, dev/prod-aware client credentials).
- **Airbnb Listing Scanner**: Scrapes comprehensive listing data from Airbnb URLs using Playwright. Uses `PLAYWRIGHT_BROWSERS_PATH` env var for consistent browser location across dev/prod.
- **Photo Analysis Insights**: AI photo selection includes per-section strengths/weaknesses bullets, hero confidence score (0-100%), alternative hero suggestions when confidence is low, and Top 5 photo swap recommendations. Data stored in `photosAnalysis` JSONB on `listing_analyses`.
- **Background Processing**: Supports background execution of analysis and data synchronization with user notifications.
- **Admin Portal**: Manages AI prompts, monitors AI usage, facilitates AI speed comparison tests, manages the global Procedure Template, and configures category weights for listing analysis.
- **Category Weights System**: Admin-configurable weights for each analysis category (title, description, photos, amenities, reviews, pet policy) used to compute weighted average overall grades.
- **Overall Grade Computation**: Centralized `recalculateOverallGrade()` computes weighted letter grades from individual category grades, stored in `overallGrade` column on `listing_analyses`.
- **Pet Policy Grading**: Simplified system - F if pets not allowed, C baseline if allowed, AI analyzes listing description to upgrade to B/A based on pet experience promotion.
- **Procedure Template System**: Super Admins can define a global default procedure template that automatically seeds as a "draft" procedure when new workspaces are created.
- **Role-Based Navigation Permissions**: Provides granular control over navigation visibility for different user roles.
- **Changelog Admin System**: Manages product updates with AI suggestions and a public changelog.
- **Ask Lumi - AI Research Agent**: A chat interface for natural language querying of workspace data.
- **Teams**: Organizes workspace members for collaboration and task assignment.
- **Default Workspace**: Allows users to set a preferred workspace for automatic selection on login.
- **Workspace Settings**: Enables admin users to manage workspace branding, including AI-generated logos.
- **Airbnb Listing Scanner**: Scrapes comprehensive listing data from Airbnb URLs using Playwright.
- **Notion Integration**: Syncs data to Notion databases via OAuth, supporting multi-database setups.
- **Reports System**: Generates actionable insights, including "Staff Meeting Reports" and "Repeat Guests Reports."
- **Slack Integration**: Sends automated Slack alerts when new AI Sentiment Scores are generated.
- **Review Removal Agent**: AI-powered review dispute system with staged flow (Analysis → 1st Challenge → 2nd Challenge → Arbitration). Detects bad reviews (<5 stars), auto-analyzes removal likelihood (Low/Medium/High), generates challenge responses and arbitration letters using Airbnb's own Terms of Service. Cases tracked by reservation ID with admin-editable prompts. Data stored in `review_removal_cases` table.
- **Nudge AI Agent**: AI-powered SMS conversations (Twilio integration) for collecting guest feedback.
- **Inbox**: A read-only view for monitoring host-guest conversations from webhook data.
- **Cleaner Scheduling System**: Manages cleaning staff, schedules, cleaning tasks, and turnovers.
  - **Automated Data Sync & AI Analysis**: Fetches data, performs AI analysis on reservations in batches, generates tags with sentiment, creates or matches themes, and auto-creates tasks.
  - **Webhook-Driven Cleaning Task Auto-Generation**: Cleaning tasks are automatically created/updated/cancelled based on Hospitable reservation webhooks.
  - **Turnovers View**: Displays all reservations with associated cleaning task information.
  - **Cleaning Manager Auto-Assignment**: Cleaning managers can configure per-property auto or manual assignment modes for cleaning tasks.
  - **Properties Tab**: Assigns default cleaning procedures to each property.
- **Procedure Step Voice Notes & Issues**: Each procedure step supports voice notes with AI transcription and summarization, and issue reporting with photos and descriptions.
- **Procedure Lock Permissions**: Creator-controlled locking to prevent structural changes by non-creators.
- **Mobile App**: A dedicated mobile-optimized web app for task and procedure management during property turnovers.
  - **Company Management**: Cleaning company managers and cleaning managers can manage their team and property assignments from the mobile app.
  - **GPS Verification**: Steps with `requiresGpsVerification` show real-time accuracy visualization and location validation.
  - **Photo Verification**: Steps with `requiresPhotoVerification` support camera capture and photo upload.
  - **Step Comments & Voice Notes**: Incomplete steps can have text comments and voice notes with transcription and translation.

### UI/UX Decisions
- Modern UI built with shadcn/ui on Radix UI, styled with Tailwind CSS, supporting light/dark modes.
- Features include a collapsible sidebar, sticky sync configurations, and enhanced property data display.
- Persistent Sync Progress Modal: Provides real-time background sync progress via SSE.

## External Dependencies

### Third-Party Services
- **Replit Auth**: OpenID Connect for user authentication.
- **PostgreSQL**: Hosted database.
- **Hospitable**: Property management platform API for data integration.
- **OpenAI**: AI model (gpt-4.1-mini) for listing analysis.
- **OpenRouter**: Provides access to Grok/xAI models for AI speed comparison tests.
- **Twilio**: For two-way SMS messaging in the Nudge AI Agent.
- **Resend**: Email service.
- **Playwright**: For web scraping Airbnb listings.
- **Gemini flash-image model**: Used for AI logo generation.

### Key NPM Packages
- **UI**: Radix UI, shadcn/ui, Lucide icons.
- **Data**: Drizzle ORM, TanStack React Query, Zod.
- **Authentication**: Passport.js, openid-client, express-session.
- **Build**: Vite, esbuild, tsx.