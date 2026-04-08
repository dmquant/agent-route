# UI Design Document: Analyst

**Project:** Analyst — A Professional AI Analyst  
**Version:** 1.0  
**Date:** 2026-04-07  
**Status:** Final  
**Workspace:** `pm_7a9638db-5127-4913-9c8e-293f2b511c65`

---

## 1. Design System

### 1.1 Visual Identity
The Analyst platform aims for a **professional, data-dense, yet clean** aesthetic. It should feel like a high-end financial terminal (e.g., Bloomberg/Refinitiv) but with the approachability of a modern SaaS tool (e.g., Notion/Linear).

### 1.2 Color Palette
| Category | Color | Hex | Usage |
|---|---|---|---|
| **Primary** | Navy Blue | `#0F172A` | Sidebar background, primary text, headers |
| **Accent** | Indigo | `#6366F1` | Primary buttons, active states, progress indicators |
| **Success** | Emerald | `#10B981` | Completed states, positive sentiment, "Running" |
| **Warning** | Amber | `#F59E0B` | Partial failure, low confidence, "Queued" |
| **Error** | Rose | `#F43F5E` | Failed states, high risk, "Error" |
| **Background** | Slate | `#F8FAFC` | Main workspace background |
| **Surface** | White | `#FFFFFF` | Cards, input areas, report panels |
| **Border** | Slate 200 | `#E2E8F0` | Dividers, card borders, table borders |

### 1.3 Typography
- **Primary Font**: Inter (Sans-serif) - used for UI elements, labels, and UI text.
- **Monospace Font**: JetBrains Mono - used for data pastes, JSON views, and terminal logs.
- **Weights**: 
  - Regular (400) for body text.
  - Medium (500) for labels and navigation.
  - Semi-Bold (600) for headers.

### 1.4 Spacing & Grid
- **Base Unit**: 4px.
- **Layout**: 12-column grid for main content areas.
- **Sidebar**: Fixed 260px width.
- **Padding**: 24px (6 units) for main container padding; 16px (4 units) for internal component padding.

### 1.5 Component Library Recommendation
- **Tailwind CSS**: For styling.
- **Radix UI / Headless UI**: For accessible primitives (Modals, Dropdowns, Tabs).
- **Lucide React**: For consistent, clean iconography.
- **Recharts**: For data visualization.
- **React-Markdown**: For rendering AI analysis reports.

---

## 2. Information Architecture

### 2.1 Site Map
1. **Dashboard**: High-level overview of activity and system status.
2. **General Analysis**: Workspace for template-based and free-form single-shot analysis.
3. **Equity Research**: Specialized workflow for multi-agent stock analysis.
4. **History**: Searchable archive of all past analysis sessions and research tasks.
5. **Library**: Management of analysis templates (built-in and custom).
6. **Settings**: Configuration for LLM backends, API keys, and system defaults.

### 2.2 Navigation Structure
- **Persistent Sidebar**: Left-aligned navigation with section icons.
- **Top Header**: Breadcrumbs, global search, system status indicator (WS connection), and user/settings shortcut.
- **Contextual Action Bar**: (Inside workspaces) Export, Share, and Model Selection controls.

### 2.3 User Flows
- **General Flow**: Select Template -> Input Data -> Run Analysis -> View/Edit Report -> Export.
- **Equity Flow**: Enter Ticker -> Select Agents -> Monitor Parallel Execution -> View Consolidated Report.

---

## 3. Page/Screen Inventory

| Page | Purpose |
|---|---|
| **Dashboard** | Overview of active tasks, recent reports, and system health. |
| **General Analysis Workspace** | The "empty state" and "active state" for processing single-shot requests. |
| **Equity Research Workspace** | Ticker-driven research configuration and real-time monitoring. |
| **Report Viewer** | High-fidelity rendering of completed reports with section navigation. |
| **History / Archive** | Table view with filters (Type, Model, Status, Date) and search. |
| **Template Library** | Grid view of available templates with "Create New" capability. |
| **Settings** | Configuration forms for backend connectivity and UI preferences. |

---

## 4. Wireframe Descriptions

### 4.1 Global Sidebar
- **Top**: Project Logo ("Analyst") + version.
- **Middle**: Nav items (Dashboard, General, Equity, History, Library).
- **Bottom**: System Health Indicator (WebSocket icon: Green/Pulse/Red), Settings link.

### 4.2 General Analysis Workspace
- **Input Section (Top)**:
  - Tabs: "Text Input", "File Upload", "URL", "Data Paste".
  - Template Dropdown: Pre-populated with SWOT, Risk, etc.
  - Model Selection: Client (Claude/Gemini/Ollama) and specific model dropdown.
- **Output Section (Bottom)**:
  - Streaming window with Markdown rendering.
  - "Run Analysis" primary button in footer.
  - Floating "Stop" button during execution.

### 4.3 Equity Research Workspace
- **Setup View**:
  - Center-aligned large ticker input (e.g., "Enter Ticker: AAPL").
  - Checklist of agents (Macro, Fundamental, Technical, etc.).
  - "Start Research" button.
- **Monitoring View**:
  - Grid of 6 agent cards. Each card shows: Status (Pending/Running/Done), Progress bar, and mini-log snippet.
- **Result View**:
  - Redirects to a specialized version of the Report Viewer.

### 4.4 Report Viewer
- **Left Sidebar (Outline)**: List of headers for quick scrolling.
- **Main Content**: Markdown-rendered report with sticky header (Report Title, Export buttons).
- **Interactions**:
  - Thumbs up/down at the end of sections.
  - "Follow-up" chat bubble fixed at bottom right or a dedicated input box at the end.

---

## 5. Responsive Design

- **Desktop (>= 1280px)**: Full sidebar visible, multi-column layout for dashboard.
- **Tablet (768px - 1279px)**: Sidebar collapses to icons or hamburger menu. Grid layouts stack to 1-2 columns.
- **Mobile (< 768px)**: (Secondary Priority per NFR-044) Full-width inputs, bottom-sheet for navigation, scrollable horizontal tabs for report sections.

---

## 6. Accessibility (WCAG 2.1 AA)

- **Color Contrast**: Ensure all text passes 4.5:1 ratio against background.
- **Keyboard Navigation**: Focus traps in modals, logical tab order (Sidebar -> Header -> Content -> Footer).
- **Aria Labels**: Required for icon-only buttons (e.g., Sidebar collapse, Export icons).
- **Screen Readers**: Use semantic HTML (`<main>`, `<nav>`, `<article>`) and `aria-live` regions for streaming output logs.

---

## 7. State Management

- **Loading States**: Skeletons for cards/tables; pulsing progress bars for agents.
- **Empty States**: Illustrated empty states for "No History Found" or "Select a Template to Begin".
- **Error States**: Inline alert banners (Indigo for info, Rose for errors) with "Retry" buttons.
- **Streaming State**: Auto-scroll behavior for the output window (with a "Unlock Scroll" toggle).

---

## 8. Animation & Transitions

- **Micro-interactions**: 
  - Hover effects on cards and nav items (subtle scale/color shift).
  - "Thinking" pulse animation on agent icons during LLM latency.
- **Page Transitions**: Subtle fade-in/out (200ms) when switching routes.
- **Streaming Output**: Smooth "typewriter" or "chunk-in" animation for new tokens.

---

## 9. Component Specifications

### 9.1 AgentCard (Equity Research)
- **Props**: `agentType`, `status`, `logs`, `output`.
- **Variants**: `pending` (grayscale), `running` (indigo pulse), `completed` (emerald border), `failed` (rose background).

### 9.2 MarkdownReport
- **Props**: `content` (string), `isStreaming` (bool).
- **Features**: Table rendering, syntax highlighting for code blocks, LaTeX support for financial formulas.

### 9.3 FileDropZone
- **Props**: `maxSize`, `acceptedTypes`, `onUpload`.
- **UI**: Dashed border, "Drag & Drop" text, list of uploaded files with progress bars.

---

*End of UI Design Document*
