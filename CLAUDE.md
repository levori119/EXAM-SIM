# CLAUDE.md — Exam Simulator System Architecture & AI Guidelines

Welcome to the **Exam Simulator System** project! This document serves as the single source of truth for Claude (and developers) when building, maintaining, and extending this platform.

---

## 1. Executive System Overview

The system is a cross-platform, offline-first exam simulation, study, and evaluation engine.

### Key Capabilities:
1. **Document & Media Ingestion Engine:**
   - Ingests multiple file formats (primarily PDFs, images, text).
   - Identifies questions and correct answers (detects highlighted text, colored marks, circle annotations, or separate answer keys at the end of documents).
   - Automatically correlates questions with supplementary media files (diagrams, figures, schemas, images).
2. **Exam Generation & Adaptive Learning Engine:**
   - Generates practice/study modes (with instant feedback and explanations).
   - Generates formal dynamic Final Exams based on customizable rules (weighted sub-topics, difficulty, timer constraints, non-repeat rules).
3. **Examinee & Session Management:**
   - User profile tracking, progress metrics, attempt histories, and performance analytics.
4. **Cross-Platform & Offline-First (PWA / Mobile / Desktop):**
   - Seamless operation on Desktop, iPad/Tablets, and Mobile devices.
   - Offline-first execution: Local storage synchronization (IndexedDB / RxDB) with smooth background syncing to **Neon DB** via **Railway** hosted backend.
5. **High-Standard UX & Accessibility:**
   - Modern, fluid interface with strong focus on dark mode, touch targets for iPads/phones, smooth transitions, and minimal latency.

---

## 2. Tech Stack & Infrastructure Specifications

| Layer | Technology |
|---|---|
| **Frontend Framework** | React (Vite) / Next.js (App Router) + PWA capabilities / Capacitor (for native Desktop/iPad/Mobile wrappers) |
| **Styling & UI** | Tailwind CSS + Shadcn/UI + Lucide Icons + Framer Motion (for high-end UX) |
| **Offline Storage** | IndexedDB via RxDB / Dexie.js (local sync engine) |
| **Backend API** | Node.js (TypeScript) / Fastify or Express hosted on **Railway** |
| **Database** | **Neon PostgreSQL** (Serverless Postgres with branching support) |
| **ORM / Query Builder** | Prisma or Drizzle ORM (with offline-to-online sync adapters) |
| **PDF & Vision Processing** | PDF.js + Tesseract.js / OpenCV / LLM Vision Pipeline (Claude Sonnet 5.5 Vision — `claude-sonnet-5-5`) |

---

## 3. SkyBoard Skill Transplants & Adaptations

This system adopts, transplants, and implements the robust operational **Skills** architecture proven in the **SkyBoard** application:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SKYBOARD TRANSPLANTED SKILLS                        │
├─────────────────────┬─────────────────────┬─────────────────────────────┤
│ 1. Document Parsing │ 2. Media Linker     │ 3. Offline Sync Manager     │
│    & OCR Parser     │    & Schema Match   │    & Queue Worker           │
├─────────────────────┼─────────────────────┼─────────────────────────────┤
│ 4. Adaptive Test    │ 5. Analytics &      │ 6. Multi-Device Responsive  │
│    Generator        │    User Tracker     │    UI & Layout Engine       │
└─────────────────────┴─────────────────────┴─────────────────────────────┘
```

### Skill Details & Protocols:

#### `skill-doc-ocr-parser`
- **Purpose:** Ingest PDFs/Docs, detect structure, extract questions, options, and answer keys.
- **Rule Set:**
  - Parse layout structures and identify distinct question blocks.
  - Detect colored highlights (e.g., green/yellow text overlays for correct answers).
  - Detect visual annotations (checked boxes, circled letters).
  - Parse trailing answer key tables/pages and auto-map answers to corresponding question IDs.

#### `skill-media-diagram-linker`
- **Purpose:** Correlate external diagram/image files with the relevant questions.
- **Rule Set:**
  - Match figure IDs (e.g., "Figure 3.1", "איור 2", "תרשים א'") to question text references.
  - Automatically crop, compress, and cache image assets locally in IndexedDB for offline viewing.

#### `skill-offline-sync-engine`
- **Purpose:** Maintain full system functionality without an internet connection.
- **Rule Set:**
  - Read/Write operations prioritize local storage (IndexedDB).
  - Queue sync tasks (exam submissions, progress updates) in an offline action queue.
  - Detect network status changes and perform optimistic UI updates with automatic delta sync to Neon DB.

#### `skill-exam-generator-rules`
- **Purpose:** Assemble practice sets and strict Final Exams.
- **Rule Set:**
  - Practice Mode: Immediate answer revelation, hints, step-by-step explanations.
  - Final Exam Mode: Strict timer, randomized question pools, topic distribution rules, no immediate feedback, single submission.

#### `skill-examinee-analytics`
- **Purpose:** Track examinee performance, historical trends, and knowledge gaps.
- **Rule Set:**
  - Calculate success rates by category/tag.
  - Flag recurring weak areas and suggest targeted remediation tests.

#### `skill-responsive-ux-controller`
- **Purpose:** Ensure fluid UX across Desktop, iPad, and Mobile.
- **Rule Set:**
  - Enforce touch-friendly tap targets (≥ 48px) on iPad/Mobile.
  - Support side-by-side split screens on iPad/Desktop (Question on left, Diagram/PDF preview on right).
  - Support offline gestures (swipe to next question, pinch-to-zoom diagrams).

---

## 4. System Architecture & Workflows

### 4.1 Document Processing Pipeline
1. **Upload:** User uploads primary PDF/Doc + optional Media/Image folder.
2. **Extraction:** `skill-doc-ocr-parser` runs OCR/Layout analysis.
3. **Linking:** `skill-media-diagram-linker` associates images with questions.
4. **Validation UI:** Human-in-the-loop validation screen to verify auto-detected answers and images before saving to database.

### 4.2 Offline Data Lifecycle
```
[User Action] ──> [Local RxDB / Dexie] ──> [UI Update (Instant)]
                         │
                         ├── (If Online)  ──> Sync Engine ──> [Railway API] ──> [Neon Postgres DB]
                         └── (If Offline) ──> Queue Task  ──> Sync on Reconnect
```

---

## 5. Coding Standards & Guidelines for Claude

When writing or modifying code in this repository, follow these rules strictly:

### General & Architecture:
- Write modular, strongly-typed **TypeScript** for both frontend and backend.
- Maintain clean separation of concerns: APIs, UI Components, Offline Adapters, Sync Logic.
- Always implement error boundaries and fallback UIs for offline scenarios or slow network connections.

### UX / Frontend Rules:
- **Responsive Layouts:** Mobile-first or responsive-first grid/flex designs. Test for Desktop (> 1024px), iPad (768px–1024px), and Mobile (< 768px).
- **Split View:** On iPad and Desktop, render a side-by-side view for question navigation / media viewing. On Mobile, use dynamic tabbed views or modal sheets.
- **Micro-interactions:** Use Framer Motion for subtle transitions (moving between questions, immediate feedback animations).
- **Accessibility:** Ensure high contrast, dark mode support, and touch accessibility.

### Database & Backend Rules (Neon + Railway):
- Use connection pooling for Neon DB interactions in serverless environments.
- Keep database schemas normalized with indexes on `examinee_id`, `question_id`, `exam_id`, and `topic_tags`.
- Support conflict resolution strategies (e.g., Last-Write-Wins or Server-Merge) in offline sync engines.

---

## 6. Prompt Commands Reference for Development

When instructing Claude during development, use these short-codes:

- `/parse-pdf [file]`: Implement/test question and answer extraction logic.
- `/build-component [component_name]`: Build a UI component with full offline & responsive support.
- `/sync-logic`: Extend or test the local-to-Neon sync pipeline.
- `/generate-exam-rules`: Update or add algorithms for test assembly.
